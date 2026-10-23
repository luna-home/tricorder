"""Tests for bin/logbuch. Run: python3 -m unittest discover -s tests"""

import importlib.machinery
import importlib.util
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parent.parent / "bin" / "logbuch"


def load(db_path):
    os.environ["LOGBUCH_DB"] = str(db_path)
    loader = importlib.machinery.SourceFileLoader("logbuch", str(SCRIPT))
    spec = importlib.util.spec_from_loader("logbuch", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class LogbuchTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.lb = load(Path(self.tmp.name) / "t.db")

    def tearDown(self):
        self.tmp.cleanup()

    def run_cli(self, *argv):
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.lb.main(list(argv))
        return buf.getvalue()

    def test_stardate(self):
        self.assertEqual(self.lb.stardate(datetime(2026, 1, 1, tzinfo=timezone.utc)), "2026.000")
        self.assertEqual(self.lb.stardate(datetime(2026, 7, 2, 12, tzinfo=timezone.utc)), "2026.500")
        self.assertEqual(self.lb.stardate(datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc)), "2026.999")

    def test_stamp_puts_real_time_first(self):
        fixed = datetime(2026, 10, 22, 8, 52).astimezone()
        row = {"ts": datetime(2026, 10, 21, 22, 52).astimezone().isoformat()}
        with mock.patch.object(self.lb, "now", return_value=fixed):
            self.assertEqual(self.lb.stamp(row), "Mi 21.10. 22:52 · vor 10 Std · Sternzeit 2026.805")

    def test_merk_confirmation_shows_real_time_first(self):
        fixed = datetime(2026, 10, 22, 9, 15).astimezone()
        with mock.patch.object(self.lb, "now", return_value=fixed):
            out = self.run_cli("merk", "T", "x", "--projekt", "p")
        self.assertEqual(out.strip(), "Eingetragen: p / T · Do 22.10. 09:15 (Sternzeit 2026.806)")

    def test_case_variants_stay_one_topic(self):
        self.run_cli("merk", "Port-Scanner", "eins", "--projekt", "p")
        out = self.run_cli("merk", "port-scanner", "zwei", "--projekt", "p")
        self.assertIn("p / Port-Scanner", out)
        rows = self.lb.open_topics("p")
        self.assertEqual([(r["topic"], r["status"]) for r in rows], [("Port-Scanner", "zwei")])

    def test_wo_hides_done_topics_and_sorts_newest_first(self):
        self.run_cli("merk", "A", "a", "--projekt", "p")
        self.run_cli("merk", "B", "b", "--projekt", "p")
        self.run_cli("merk", "C", "c", "--projekt", "q")
        self.run_cli("fertig", "B", "--projekt", "p")
        self.assertEqual([r["topic"] for r in self.lb.open_topics()], ["C", "A"])
        self.assertEqual([r["topic"] for r in self.lb.open_topics("p")], ["A"])
        # A new entry reopens a finished topic.
        self.run_cli("merk", "B", "wieder da", "--projekt", "p")
        self.assertEqual(self.lb.open_topics("p")[0]["status"], "wieder da")

    def test_zeig_resolves_substring_and_rejects_ambiguity(self):
        self.run_cli("merk", "Port-Scanner", "eins", "--projekt", "p", "--weiter", "Tests")
        out = self.run_cli("zeig", "port", "--projekt", "p")
        self.assertIn("Weiter: Tests", out)
        self.run_cli("merk", "Portal", "x", "--projekt", "p")
        with self.assertRaises(SystemExit):
            self.run_cli("zeig", "port", "--projekt", "p")

    def test_umlaut_case_variants_close_by_exact_spelling(self):
        # NOCASE folds only ASCII: "Übung" and "übung" are two topics.
        self.run_cli("merk", "Übung", "a", "--projekt", "p")
        self.run_cli("merk", "übung", "b", "--projekt", "p")
        self.assertEqual(sorted(r["topic"] for r in self.lb.open_topics("p")), ["Übung", "übung"])
        self.run_cli("fertig", "Übung", "--projekt", "p")
        self.assertEqual([r["topic"] for r in self.lb.open_topics("p")], ["übung"])
        # A query that matches neither spelling exactly stays ambiguous.
        self.run_cli("merk", "Übung", "c", "--projekt", "p")
        with self.assertRaises(SystemExit):
            self.run_cli("fertig", "ÜBUNG", "--projekt", "p")

    def test_session_start_injects_topics_and_session_env(self):
        self.run_cli("merk", "A", "Stand A", "--projekt", "proj")
        env_file = Path(self.tmp.name) / "env"
        data = {"session_id": "s1", "source": "startup", "cwd": self.tmp.name}
        with mock.patch.object(self.lb, "current_project", return_value="proj"), \
                mock.patch.dict(os.environ, {"CLAUDE_ENV_FILE": str(env_file)}), \
                mock.patch("sys.stdin", io.StringIO(json.dumps(data))):
            out = self.run_cli("hook", "session-start")
        self.assertIn("Stand A", out)
        self.assertIn("export LOGBUCH_SESSION=s1", env_file.read_text())

    def test_hooks_are_inert_in_summarizer_child(self):
        data = {"session_id": "s", "reason": "other", "transcript_path": __file__}
        with mock.patch.dict(os.environ, {"LOGBUCH_CHILD": "1"}), \
                mock.patch.object(self.lb, "spawn_summarizer") as spawn, \
                mock.patch("sys.stdin", io.StringIO(json.dumps(data))):
            self.run_cli("hook", "session-end")
        spawn.assert_not_called()

    def test_session_end_skips_resume_and_small_transcripts(self):
        big = Path(self.tmp.name) / "big.jsonl"
        big.write_bytes(b"x" * (self.lb.MIN_TRANSCRIPT_BYTES + 1))
        cases = [({"reason": "resume", "transcript_path": str(big)}, False),
                 ({"reason": "other", "transcript_path": __file__}, False),
                 ({"reason": "other", "transcript_path": str(big)}, True)]
        for data, expected in cases:
            with mock.patch.object(self.lb, "spawn_summarizer") as spawn:
                self.lb.hook_session_end(data)
            self.assertEqual(spawn.called, expected, data)

    def test_parse_claude_output(self):
        entry = {"relevant": True, "topic": "T", "status": "S"}
        self.assertEqual(self.lb.parse_claude_output(json.dumps({"structured_output": entry})), entry)
        self.assertEqual(self.lb.parse_claude_output(json.dumps({"result": json.dumps(entry)})), entry)
        for bad in ("nope", json.dumps({"is_error": True, "result": "x"}), json.dumps({"result": "x"})):
            with self.assertRaises(ValueError):
                self.lb.parse_claude_output(bad)


if __name__ == "__main__":
    unittest.main()
