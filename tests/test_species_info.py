import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import species_info


class SpeciesInfoTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache_path = os.path.join(self.tmp.name, "species_cache.json")

    def test_generates_summary_and_fun_fact(self):
        calls = []

        def fake_fetcher(name, api_key):
            calls.append((name, api_key))
            return {"summary": "A small brown bird.", "fun_fact": "It sings in duets."}

        info = species_info.get_species_info(
            "Abbott's Babbler",
            api_key="test-key",
            cache_path=self.cache_path,
            fetcher=fake_fetcher,
        )

        self.assertEqual(info["summary"], "A small brown bird.")
        self.assertEqual(info["fun_fact"], "It sings in duets.")
        self.assertFalse(info["cached"])
        self.assertEqual(calls, [("Abbott's Babbler", "test-key")])

    def test_reuses_cached_profile(self):
        calls = []

        def fake_fetcher(name, api_key):
            calls.append(name)
            return {"summary": "Summary.", "fun_fact": "Fact."}

        species_info.get_species_info(
            "ABBOTTS BABBLER",
            api_key="test-key",
            cache_path=self.cache_path,
            fetcher=fake_fetcher,
        )
        info = species_info.get_species_info(
            "abbotts babbler",
            api_key="test-key",
            cache_path=self.cache_path,
            fetcher=fake_fetcher,
        )

        self.assertTrue(info["cached"])
        self.assertEqual(calls, ["ABBOTTS BABBLER"])

    def test_requires_api_key(self):
        with patch.dict(os.environ, {"GROQ_API_KEY": ""}):
            with self.assertRaises(species_info.SpeciesInfoError):
                species_info.get_species_info(
                    "ABBOTTS BABBLER", cache_path=self.cache_path
                )

    def test_rejects_blank_name(self):
        with self.assertRaises(species_info.SpeciesInfoError):
            species_info.get_species_info("   ", api_key="test-key", cache_path=self.cache_path)

    def test_parses_json_wrapped_in_code_fence(self):
        profile = species_info.parse_profile(
            '```json\n{"summary": "Summary.", "fun_fact": "Fact."}\n```'
        )

        self.assertEqual(profile, {"summary": "Summary.", "fun_fact": "Fact."})

    def test_rejects_incomplete_profile(self):
        with self.assertRaises(species_info.SpeciesInfoError):
            species_info.parse_profile('{"summary": "Summary."}')


if __name__ == "__main__":
    unittest.main()
