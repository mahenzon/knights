import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile


spec = importlib.util.spec_from_file_location(
    "prepare_android", Path(__file__).parents[1] / "tools/prepare_android.py")
android = importlib.util.module_from_spec(spec)
spec.loader.exec_module(android)


class AndroidKitTests(unittest.TestCase):
    def test_rejects_wrong_digest_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "untrusted.zip"
            archive.write_bytes(b"not the official emulator")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                android.prepare(archive, root / "game.ipa", root / "output")
            self.assertFalse((root / "output").exists())

    def test_preserves_ipa_and_builds_reproducible_kit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release = root / "release.zip"
            with ZipFile(release, "w") as archive:
                archive.writestr("touchHLE.apk", b"test apk bytes")
                archive.writestr("COPYING.txt", b"test license")
            ipa = root / "Original Game.ipa"
            original = b"\x00original IPA bytes\xff\x00"
            ipa.write_bytes(original)
            output = root / "output"
            with patch.object(android, "RELEASE_SHA256", android.file_hash(release)):
                provenance = android.prepare(release, ipa, output)
                first_zip = (output / "android-kit.zip").read_bytes()
                android.prepare(release, ipa, output)
            self.assertEqual(ipa.read_bytes(), original)
            self.assertEqual((output / "Knights-Onrush.ipa").read_bytes(), original)
            self.assertEqual(provenance["game"]["sha256"], android.file_hash(ipa))
            self.assertEqual((output / "android-kit.zip").read_bytes(), first_zip)
            with ZipFile(output / "android-kit.zip") as archive:
                self.assertEqual(archive.namelist(), list(android.FILES))
                self.assertEqual(archive.read("Knights-Onrush.ipa"), original)
            for line in (output / "SHA256SUMS").read_text().splitlines():
                checksum, name = line.split("  ", 1)
                self.assertEqual(android.file_hash(output / name), checksum)


if __name__ == "__main__":
    unittest.main()
