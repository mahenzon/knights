import importlib.util
import io
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib
from zipfile import ZipFile


spec = importlib.util.spec_from_file_location(
    "extract_assets", Path(__file__).parents[1] / "tools/extract_assets.py")
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class AssetRecoveryTests(unittest.TestCase):
    def test_all_filters_and_alpha_recovery(self):
        # Two pixels per row exercise left/up/diagonal predictors and row boundaries.
        rows = [bytes((30, 20, 10, 255, 60, 40, 20, 255)),
                bytes((0, 32, 64, 128, 20, 10, 5, 255)),
                bytes((10, 20, 30, 255, 40, 50, 60, 255)),
                bytes((1, 2, 3, 0, 0, 0, 0, 0)),
                bytes((1, 0, 0, 1, 90, 60, 30, 255))]
        encoded = bytearray()
        previous = bytes(8)
        for kind, row in enumerate(rows):
            encoded.append(kind)
            for x, value in enumerate(row):
                left = row[x - 4] if x >= 4 else 0
                up = previous[x]
                diagonal = previous[x - 4] if x >= 4 else 0
                predictors = (0, left, up, (left + up) // 2,
                              assets.paeth(left, up, diagonal))
                encoded.append((value - predictors[kind]) & 255)
            previous = row
        self.assertEqual(assets.unfilter_rows(encoded, 2, 5, 4), rows)
        compressor = zlib.compressobj(wbits=-15)
        compressed = compressor.compress(encoded) + compressor.flush()
        source = assets.PNG_SIGNATURE + b"".join((
            assets.png_chunk(b"CgBI", b"\x40\xa0\x60\x82"),
            assets.png_chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 5, 8, 6, 0, 0, 0)),
            assets.png_chunk(b"IDAT", compressed[:5]),
            assets.png_chunk(b"IDAT", compressed[5:]),
            assets.png_chunk(b"IEND", b"")))
        result, width, height, converted = assets.convert_png(source)
        self.assertEqual((width, height, converted), (2, 5, True))
        chunks = assets.png_chunks(result)
        self.assertNotIn(b"CgBI", [kind for kind, _ in chunks])
        decoded = zlib.decompress(b"".join(data for kind, data in chunks if kind == b"IDAT"))
        pixels = assets.unfilter_rows(decoded, 2, 5, 4)
        self.assertEqual(pixels[0], bytes((10, 20, 30, 255, 20, 40, 60, 255)))
        self.assertEqual(pixels[1], bytes((128, 64, 0, 128, 5, 10, 20, 255)))
        self.assertEqual(pixels[3], bytes(8))
        self.assertEqual(pixels[4], bytes((0, 0, 255, 1, 30, 60, 90, 255)))
        self.assertEqual(assets.convert_png(result), (result, 2, 5, False))

    def test_paeth_choices(self):
        self.assertEqual(assets.paeth(10, 10, 0), 10)
        self.assertEqual(assets.paeth(1, 9, 0), 9)
        self.assertEqual(assets.paeth(100, 50, 75), 75)

    def test_rejects_corrupt_png(self):
        with self.assertRaises(ValueError):
            assets.png_chunks(assets.PNG_SIGNATURE + assets.png_chunk(b"IEND", b"")[:-1] + b"x")
        with self.assertRaises(ValueError):
            assets.unfilter_rows(b"\x05\0\0\0\0", 1, 1, 4)

    def test_rejects_oversized_deflate(self):
        compressor = zlib.compressobj(wbits=-15)
        compressed = compressor.compress(bytes(10000)) + compressor.flush()
        source = assets.PNG_SIGNATURE + b"".join((
            assets.png_chunk(b"CgBI", b"\x40\xa0\x60\x82"),
            assets.png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)),
            assets.png_chunk(b"IDAT", compressed),
            assets.png_chunk(b"IEND", b"")))
        with self.assertRaisesRegex(ValueError, "oversized"):
            assets.convert_png(source)

    def test_jpeg_dimensions(self):
        # Baseline JPEG frame: precision, height, width, component count.
        source = b"\xff\xd8\xff\xc0" + struct.pack(">HBHHB", 8, 8, 320, 480, 0)
        self.assertEqual(assets.jpeg_dimensions(source), (480, 320))
        with self.assertRaises(ValueError):
            assets.jpeg_dimensions(source[:-1])

    def test_archive_path_validation_and_duplicates(self):
        for names in (("../outside.png",),
                      ("Payload/Knights.app/a.png", "Payload/Knights.app/sub/a.png"),
                      ("Payload/Knights.app/a.png", "Payload/Knights.app/A.png")):
            with self.subTest(names=names), io.BytesIO() as stream:
                with ZipFile(stream, "w") as archive:
                    for name in names:
                        archive.writestr(name, b"dummy")
                stream.seek(0)
                with ZipFile(stream) as archive, self.assertRaises(ValueError):
                    assets.select_assets(archive)

    def test_archive_size_limit(self):
        with io.BytesIO() as stream:
            with ZipFile(stream, "w") as archive:
                archive.writestr("Payload/Knights.app/font_std.fnt", b"1234")
            stream.seek(0)
            with ZipFile(stream) as archive, patch.object(assets, "MAX_FILE_BYTES", 3):
                with self.assertRaisesRegex(ValueError, "size limit"):
                    assets.select_assets(archive)

    def test_extraction_is_reproducible_and_excludes_openfeint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ipa = root / "game.ipa"
            with ZipFile(ipa, "w") as archive:
                archive.writestr("Payload/Knights.app/font_std.fnt", b"[HGEFONT]\r\n")
                archive.writestr("Payload/Knights.app/OFButton.png", b"excluded")
                archive.writestr("Payload/Knights.app/OpenFeint.png", b"excluded")
                archive.writestr("Payload/Knights.app/Knights", b"not executable")
            manifest = root / "manifest.json"
            first = assets.extract(ipa, root / "assets", manifest)
            first_bytes = manifest.read_bytes()
            second = assets.extract(ipa, root / "assets", manifest)
            self.assertEqual(first, second)
            self.assertEqual(manifest.read_bytes(), first_bytes)
            self.assertEqual(first["counts"], {"fnt": 1})
            self.assertEqual(first["files"][0]["font_format"], "HGEFONT text")
            self.assertEqual([path.name for path in (root / "assets").iterdir()], ["font_std.fnt"])


if __name__ == "__main__":
    unittest.main()
