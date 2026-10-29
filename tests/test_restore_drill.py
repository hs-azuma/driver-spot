import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('restore_drill', ROOT / 'scripts/local-backup-drill.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DrillTests(unittest.TestCase):
    def test_missing_runtime_never_starts_process(self):
        with patch.object(module.shutil, 'which', return_value=None), patch.object(module.subprocess, 'run') as run:
            self.assertEqual(module.main(), 2)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
