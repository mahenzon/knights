#!/usr/bin/env python3
"""Recover browser assets from Knights Onrush's IPA without running its code."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import struct
import zlib
from zipfile import ZipFile


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
BUNDLE = "Payload/Knights.app/"
EXTENSIONS = {".png", ".jpg", ".wav", ".mp3", ".fnt"}
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024
MAX_PIXELS = 16 * 1024 * 1024


def png_chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data)))


def png_chunks(data):
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Invalid PNG signature")
    offset = len(PNG_SIGNATURE)
    chunks = []
    while offset < len(data):
        if offset + 12 > len(data):
            raise ValueError("Truncated PNG chunk")
        size, kind = struct.unpack_from(">I4s", data, offset)
        end = offset + 12 + size
        if end > len(data):
            raise ValueError("Truncated PNG chunk data")
        payload = data[offset + 8:end - 4]
        crc, = struct.unpack_from(">I", data, end - 4)
        if crc != zlib.crc32(kind + payload):
            raise ValueError(f"Invalid PNG CRC for {kind!r}")
        chunks.append((kind, payload))
        offset = end
        if kind == b"IEND":
            if payload or offset != len(data):
                raise ValueError("Invalid PNG end")
            return chunks
    raise ValueError("PNG has no IEND")


def paeth(left, up, upper_left):
    prediction = left + up - upper_left
    distances = (abs(prediction - left), abs(prediction - up),
                 abs(prediction - upper_left))
    if distances[0] <= distances[1] and distances[0] <= distances[2]:
        return left
    return up if distances[1] <= distances[2] else upper_left


def unfilter_rows(data, width, height, bpp):
    stride = width * bpp
    if len(data) != height * (stride + 1):
        raise ValueError("PNG scanline size does not match IHDR")
    rows = []
    previous = bytearray(stride)
    for y in range(height):
        offset = y * (stride + 1)
        kind = data[offset]
        if kind > 4:
            raise ValueError(f"Unknown PNG filter {kind}")
        row = bytearray(data[offset + 1:offset + 1 + stride])
        for x in range(stride):
            left = row[x - bpp] if x >= bpp else 0
            up = previous[x]
            upper_left = previous[x - bpp] if x >= bpp else 0
            if kind == 1:
                row[x] = (row[x] + left) & 255
            elif kind == 2:
                row[x] = (row[x] + up) & 255
            elif kind == 3:
                row[x] = (row[x] + (left + up) // 2) & 255
            elif kind == 4:
                row[x] = (row[x] + paeth(left, up, upper_left)) & 255
        rows.append(row)
        previous = row
    return rows


def convert_png(data):
    chunks = png_chunks(data)
    headers = [payload for kind, payload in chunks if kind == b"IHDR"]
    if len(headers) != 1 or len(headers[0]) != 13:
        raise ValueError("PNG must have one valid IHDR")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", headers[0])
    if not width or not height or width * height > MAX_PIXELS:
        raise ValueError("PNG dimensions exceed limit")
    cgbi = any(kind == b"CgBI" for kind, _ in chunks)
    if not cgbi:
        return data, width, height, False
    if (depth, color, compression, filtering, interlace) not in (
            (8, 6, 0, 0, 0), (8, 2, 0, 0, 0)):
        raise ValueError("Unsupported CgBI format")
    bpp = 4 if color == 6 else 3
    expected = height * (width * bpp + 1)
    compressed = b"".join(payload for kind, payload in chunks if kind == b"IDAT")
    inflater = zlib.decompressobj(-15)
    raw = inflater.decompress(compressed, expected + 1)
    if (len(raw) != expected or not inflater.eof or inflater.unused_data
            or inflater.unconsumed_tail):
        raise ValueError("Invalid or oversized CgBI deflate stream")
    rows = unfilter_rows(raw, width, height, bpp)
    for row in rows:
        for x in range(0, len(row), bpp):
            row[x], row[x + 2] = row[x + 2], row[x]
            if bpp == 4:
                alpha = row[x + 3]
                for channel in range(x, x + 3):
                    # Premultiplication loses precision; round to nearest recoverable value.
                    row[channel] = min(255, (row[channel] * 255 + alpha // 2) // alpha) if alpha else 0
    encoded = zlib.compress(b"".join(b"\0" + row for row in rows), level=9)
    output = bytearray(PNG_SIGNATURE)
    wrote_idat = False
    for kind, payload in chunks:
        if kind == b"CgBI":
            continue
        if kind == b"IDAT":
            if wrote_idat:
                continue
            payload = encoded
            wrote_idat = True
        output += png_chunk(kind, payload)
    return bytes(output), width, height, True


def jpeg_dimensions(data):
    if data[:2] != b"\xff\xd8":
        raise ValueError("Invalid JPEG signature")
    offset = 2
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
           0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            raise ValueError("Invalid JPEG marker")
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset + 3 > len(data):
            break
        marker = data[offset]
        offset += 1
        if marker in (0xD9, 0xDA):
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            continue
        length, = struct.unpack_from(">H", data, offset)
        if length < 2 or offset + length > len(data):
            raise ValueError("Invalid JPEG segment length")
        if marker in sof:
            if length < 8:
                raise ValueError("Invalid JPEG frame")
            height, width = struct.unpack_from(">HH", data, offset + 3)
            if not width or not height or width * height > MAX_PIXELS:
                raise ValueError("JPEG dimensions exceed limit")
            return width, height
        offset += length
    raise ValueError("JPEG has no frame dimensions")


def select_assets(archive):
    selected = []
    names = set()
    total = 0
    for member in archive.infolist():
        path = PurePosixPath(member.filename)
        if (path.is_absolute() or ".." in path.parts or "\\" in member.filename
                or "\0" in member.filename or ":" in member.filename):
            raise ValueError(f"Unsafe archive path: {member.filename!r}")
        if member.is_dir() or not member.filename.startswith(BUNDLE):
            continue
        if path.suffix.lower() not in EXTENSIONS or path.name.startswith(("OF", "OpenFeint")):
            continue
        if stat.S_ISLNK(member.external_attr >> 16):
            raise ValueError(f"Asset is a symlink: {member.filename}")
        if path.name.casefold() in names:
            raise ValueError(f"Duplicate asset filename: {path.name}")
        if member.file_size > MAX_FILE_BYTES:
            raise ValueError(f"Asset exceeds size limit: {path.name}")
        names.add(path.name.casefold())
        total += member.file_size
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Assets exceed total size limit")
        selected.append(member)
    if not selected:
        raise ValueError(f"No assets found in {BUNDLE}")
    return sorted(selected, key=lambda member: member.filename)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def extract(ipa, output, manifest_path):
    output.mkdir(parents=True, exist_ok=True)
    files = []
    with ZipFile(ipa) as archive:
        selected = select_assets(archive)
        for member in selected:
            name = PurePosixPath(member.filename).name
            destination = output / name
            if destination.is_symlink():
                raise ValueError(f"Output asset is a symlink: {destination}")
            original = archive.read(member)
            data = original
            entry = {"name": name, "source_path": member.filename,
                     "source_bytes": len(original), "source_sha256": sha256(original),
                     "type": Path(name).suffix[1:].lower()}
            if entry["type"] == "png":
                data, entry["width"], entry["height"], entry["cgbi_converted"] = convert_png(data)
            elif entry["type"] == "jpg":
                entry["width"], entry["height"] = jpeg_dimensions(data)
            elif entry["type"] == "fnt":
                entry["font_format"] = "HGEFONT text" if data.startswith(b"[HGEFONT]") else "unknown"
            entry.update(bytes=len(data), sha256=sha256(data))
            destination.write_bytes(data)
            files.append(entry)
    with ipa.open("rb") as stream:
        archive_hash = hashlib.file_digest(stream, "sha256").hexdigest()
    manifest = {
        "version": 1,
        "source": {"archive_name": ipa.name, "archive_bytes": ipa.stat().st_size,
                   "archive_sha256": archive_hash, "bundle": BUNDLE,
                   "reference_url": "https://legacystore.app/app/312494232"},
        "conversion": "CgBI raw-deflate BGRA → standard PNG RGBA; unpremultiply with nearest rounding; fully transparent RGB cleared. Original color metadata preserved.",
        "excluded": "OpenFeint/OF UI assets and non-image/audio/font files",
        "counts": dict(sorted(Counter(entry["type"] for entry in files).items())),
        "files": files,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ipa", type=Path)
    parser.add_argument("--output", type=Path, default=Path("dist/assets"))
    parser.add_argument("--manifest", type=Path, default=Path("research/asset-manifest.json"))
    args = parser.parse_args()
    manifest = extract(args.ipa, args.output, args.manifest)
    print(f"Extracted {len(manifest['files'])} assets: {manifest['counts']}")
    print(f"Manifest: {args.manifest}")


if __name__ == "__main__":
    main()
