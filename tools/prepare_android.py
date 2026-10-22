#!/usr/bin/env python3
"""Package the original game with the verified official touchHLE Android release."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
from zipfile import ZIP_STORED, ZipFile, ZipInfo


RELEASE_URL = "https://github.com/touchHLE/touchHLE/releases/tag/v0.3.0"
RELEASE_ASSET_URL = "https://github.com/touchHLE/touchHLE/releases/download/v0.3.0/touchHLE_v0.3.0_Android_AArch64.zip"
RELEASE_SHA256 = "0e0e699f89c49b65ccdad020145d6fa34e431ab2bd5737d34a77e03b6a0cc60d"
FILES = ("touchHLE.apk", "Knights-Onrush.ipa", "COPYING.txt", "index.html", "provenance.json", "SHA256SUMS")

HTML = """<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#211a16">
<title>Knights Onrush — original game on Android</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; color: #f3e8d3; background: #211a16; font: 17px/1.6 system-ui, sans-serif; }
  main { max-width: 760px; margin: auto; padding: 40px 24px 60px; }
  h1 { font: 700 clamp(38px, 8vw, 62px)/1.05 Georgia, serif; margin: 12px 0 20px; }
  h2 { margin-top: 36px; font-size: 22px; }
  .eyebrow { color: #d5ac6a; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; }
  a { color: #f2cb87; text-underline-offset: 4px; }
  a:focus-visible { outline: 3px solid #f2cb87; outline-offset: 5px; }
  .downloads { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
  .downloads a { padding: 12px 18px; border: 1px solid #d5ac6a; border-radius: 6px; text-decoration: none; font-weight: 650; }
  .downloads a:first-child { background: #f2cb87; color: #211a16; }
  li { padding-left: 5px; margin: 16px 0; }
  code { overflow-wrap: anywhere; font-size: .92em; color: #f2cb87; }
  .note { padding: 14px 18px; border-left: 3px solid #d5ac6a; background: #30261f; }
  footer { margin-top: 36px; font-size: 14px; color: #cdbfa9; }
</style>
<main>
  <div class="eyebrow">Original game · Android test kit</div>
  <h1>Knights Onrush</h1>
  <p>The original iOS game runs inside <a href="https://touchhle.org/">touchHLE</a>, an emulator for early iPhone games. This is the original game in an emulator, <strong>not a browser port</strong>.</p>
  <p><strong>Requires an ARM64 Android device.</strong> This exact IPA has been tested on desktop: gameplay, sound, and throwing worked. <strong>Android still needs a physical-device test.</strong></p>
  <div class="downloads">
    <a href="touchHLE.apk" download>Download touchHLE APK</a>
    <a href="Knights-Onrush.ipa" download>Download the game IPA</a>
  </div>
  <h2>Install and play</h2>
  <ol>
    <li>Download both files above onto your Android phone.</li>
    <li>Open <code>touchHLE.apk</code> to install the official emulator. Allow installs from your browser when Android prompts you.</li>
    <li>Launch touchHLE once so it creates its game folders.</li>
    <li>Tap <strong>File manager</strong> in touchHLE. Copy <code>Knights-Onrush.ipa</code> from Downloads into <code>touchHLE_apps</code>.</li>
    <li>Return to touchHLE and tap <strong>Knights Onrush</strong>. Use landscape orientation for play.</li>
  </ol>
  <p class="note"><strong>Keep your progress:</strong> saves live in <code>touchHLE_sandbox</code>. Do not uninstall touchHLE or clear its app data if you want to keep your saves.</p>
  <p>If the File manager button crashes during copying, close that file manager from recent apps. Open Android’s Files app directly, find the touchHLE location, and copy the IPA into <code>touchHLE_apps</code> there.</p>
  <p>Already installed? Once the game is copied, you can launch it offline from the touchHLE app.</p>
  <footer>
    <a href="https://github.com/touchHLE/touchHLE/releases/tag/v0.3.0">Official touchHLE v0.3.0 release</a> ·
    <a href="COPYING.txt">Emulator license</a> ·
    <a href="provenance.json">Provenance</a> ·
    <a href="SHA256SUMS">SHA-256 checksums</a>
    <p>The official Android release archive was checked against its published SHA-256. The supplied IPA is copied unchanged. This kit contains no installation automation.</p>
    <a href="android-kit.zip" download>Download the complete Android kit ZIP</a>
  </footer>
</main>
</html>
"""


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(archive_path, ipa_path, output):
    archive_hash = file_hash(archive_path)
    if archive_hash != RELEASE_SHA256:
        raise ValueError("Official touchHLE archive SHA-256 mismatch; no files extracted")
    if not ipa_path.is_file():
        raise ValueError("The original IPA file is missing")
    ipa_hash = file_hash(ipa_path)
    if output.is_symlink():
        raise ValueError("Output directory must not be a symlink")
    output.mkdir(parents=True, exist_ok=True)
    for name in (*FILES, "android-kit.zip"):
        if (output / name).is_symlink():
            raise ValueError(f"Output file must not be a symlink: {name}")
    with ZipFile(archive_path) as archive:
        for name, size_limit in (("touchHLE.apk", 64 * 1024 * 1024), ("COPYING.txt", 1024 * 1024)):
            members = [info for info in archive.infolist() if info.filename == name]
            if len(members) != 1 or members[0].file_size > size_limit:
                raise ValueError(f"Invalid official release member: {name}")
            (output / name).write_bytes(archive.read(members[0]))
    shutil.copyfile(ipa_path, output / "Knights-Onrush.ipa")
    if file_hash(output / "Knights-Onrush.ipa") != ipa_hash:
        raise ValueError("IPA copy checksum mismatch")
    (output / "index.html").write_text(HTML, encoding="utf-8")
    provenance = {
        "emulator": {"name": "touchHLE", "version": "0.3.0", "platform": "Android AArch64",
                     "release_url": RELEASE_URL, "release_asset_url": RELEASE_ASSET_URL,
                     "release_archive_sha256": archive_hash},
        "game": {"source_filename": ipa_path.name, "output_filename": "Knights-Onrush.ipa",
                 "sha256": ipa_hash, "bytes": ipa_path.stat().st_size,
                 "copied_unchanged": True},
        "verification": {"desktop": "User confirmed original gameplay, sound, and throwing with this IPA",
                         "android": "Not yet physically tested"},
        "files": [{"name": name, "bytes": (output / name).stat().st_size,
                   "sha256": file_hash(output / name)} for name in FILES[:4]],
    }
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    (output / "SHA256SUMS").write_text("".join(
        f"{file_hash(output / name)}  {name}\n" for name in FILES[:-1]), encoding="utf-8")
    # APK and IPA are already compressed; storing them avoids wasted recompression.
    with ZipFile(output / "android-kit.zip", "w", compression=ZIP_STORED) as archive:
        for name in FILES:
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (output / name).read_bytes())
    return provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=Path("research/touchHLE-android.zip"))
    parser.add_argument("--ipa", type=Path, default=Path("/Users/mahenzon/Downloads/Knights Onrush.ipa"))
    parser.add_argument("--output", type=Path, default=Path("dist/android"))
    args = parser.parse_args()
    prepare(args.archive, args.ipa, args.output)
    print(f"Prepared {len(FILES)} kit files and android-kit.zip in {args.output}")


if __name__ == "__main__":
    main()
