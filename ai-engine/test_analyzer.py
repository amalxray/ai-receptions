import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCRIPT = ROOT / "analyzer.py"


class AnalyzerTest(unittest.TestCase):
    def test_cli_test_mode_reports_success(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--test"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "ok")
        self.assertIn("environment", payload)


if __name__ == "__main__":
    unittest.main()
