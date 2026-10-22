import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location(
    "prepare_game_data", ROOT / "tools/prepare_game_data.py")
game_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(game_data)


class GameDataTests(unittest.TestCase):
    def test_preserves_original_outputs_without_research_captures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("data", "dist/assets", "web", "engine/src"):
                (root / name).mkdir(parents=True)
            shutil.copyfile(ROOT / "data/game-source.json", root / "data/game-source.json")
            (root / "dist/assets/example.png").touch()
            (root / "dist/assets/unused.json").touch()
            with patch.object(game_data, "ROOT", root):
                game_data.prepare()
            data = json.loads((root / "web/game-data.json").read_text())
            self.assertEqual(data["assets"], ["example.png"])
            data["assets"] = []
            # Captured before extracting production inputs; assets depend on the local art bundle.
            self.assertEqual(
                hashlib.sha256(json.dumps(data, separators=(",", ":")).encode()).hexdigest(),
                "fb2978d82824dedb99e4aee2b6644f59242b617ce099b6df8068bdd4cde628c4",
            )
            self.assertEqual(
                hashlib.sha256((root / "engine/src/data.rs").read_bytes()).hexdigest(),
                "ed1145a481f6fd616e6575e34d18ab3245e9f1ba70a9f740cd6580f8a1a90c4d",
            )


if __name__ == "__main__":
    unittest.main()
