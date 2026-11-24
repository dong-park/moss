from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from audit import clean_report
from release import Rejected

class AuditTest(unittest.TestCase):
    def test_low_only_retains_existing_high_critical_policy(self):
        self.assertTrue(clean_report(1,b'{"package":[{"severity":"low"}]}'))
        self.assertTrue(clean_report(0,b'{}'))
    def test_high_or_critical_never_pass(self):
        for severity in ('high','critical'):
            self.assertFalse(clean_report(1,('{"package":[{"severity":"'+severity+'"}]}').encode()))
    def test_failed_or_unrecognized_registry_report_never_passes(self):
        for code,data in [(1,b'{}'),(1,b'{"error":"offline"}'),(1,b''),(0,b'[]'),(2,b'{}'),
                          (1,b'{"package":[{"severity":"unknown"}]}')]:
            with self.subTest(code=code,data=data):
                with self.assertRaises(Rejected):clean_report(code,data)


class AuditSeverityLevelsTest(unittest.TestCase):
    def test_info_is_a_known_non_blocking_level(self):
        self.assertTrue(clean_report(1,b'{"package":[{"severity":"info"},{"severity":"moderate"}]}'))
        self.assertFalse(clean_report(1,b'{"package":[{"severity":"info"},{"severity":"high"}]}'))
    def test_unknown_or_malformed_levels_still_fail_closed(self):
        for severity in ('INFO','informational','none','',None,1):
            with self.subTest(severity=severity):
                data=('{"package":[{"severity":'+__import__('json').dumps(severity)+'}]}').encode()
                with self.assertRaises(Rejected):clean_report(1,data)
