import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('auth_email', Path(__file__).resolve().parents[1] / 'scripts/apply-auth-email.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
TEMPLATE = {'mailer_subjects_confirmation': '確認', 'mailer_templates_confirmation_content': '<a href="{{ .ConfirmationURL }}">確認</a>'}


class AuthEmailTests(unittest.TestCase):
    def api(self, initial, reject_patch=False):
        state = dict(initial)
        calls = []
        def call(token, method='GET', payload=None):
            calls.append((method, payload))
            if method == 'PATCH' and not reject_patch:
                state.update(payload)
            return dict(state)
        return call, calls, state

    def test_existing_smtp_and_security_settings_are_preserved(self):
        api, calls, state = self.api({'smtp_host': 'existing.example', 'smtp_pass': 'private', 'mailer_autoconfirm': False, 'site_url': 'https://spodora.com'})
        module.apply(TEMPLATE, {'SUPABASE_ACCESS_TOKEN': 'test'}, api)
        self.assertEqual(calls[1], ('PATCH', TEMPLATE))
        self.assertEqual(state['smtp_pass'], 'private')
        self.assertFalse(state['mailer_autoconfirm'])
        self.assertEqual(state['site_url'], 'https://spodora.com')

    def test_missing_smtp_key_does_not_partially_apply(self):
        api, calls, _ = self.api({})
        with self.assertRaises(module.ConfigurationError):
            module.apply(TEMPLATE, {'SUPABASE_ACCESS_TOKEN': 'test'}, api)
        self.assertEqual([c[0] for c in calls], ['GET'])

    def test_bootstrap_smtp_and_template_only(self):
        api, calls, _ = self.api({'mailer_autoconfirm': False})
        module.apply(TEMPLATE, {'SUPABASE_ACCESS_TOKEN': 'test', 'RESEND_AUTH_API_KEY': 'test'}, api)
        self.assertEqual(set(calls[1][1]), module.TEMPLATE_KEYS | set(module.SMTP) | {'smtp_pass'})
        self.assertNotIn('mailer_autoconfirm', calls[1][1])

    def test_no_write_when_settings_already_match(self):
        api, calls, _ = self.api({**TEMPLATE, 'smtp_host': 'existing.example'})
        module.apply(TEMPLATE, {'SUPABASE_ACCESS_TOKEN': 'test'}, api)
        self.assertEqual([c[0] for c in calls], ['GET', 'GET'])

    def test_readback_failure_is_not_success(self):
        api, _, _ = self.api({'smtp_host': 'existing.example'}, reject_patch=True)
        with self.assertRaises(module.ConfigurationError):
            module.apply(TEMPLATE, {'SUPABASE_ACCESS_TOKEN': 'test'}, api)

    def test_extra_setting_rejected_before_api_call(self):
        api, calls, _ = self.api({})
        with self.assertRaises(module.ConfigurationError):
            module.apply({**TEMPLATE, 'mailer_autoconfirm': True}, {'SUPABASE_ACCESS_TOKEN': 'test'}, api)
        self.assertFalse(calls)


if __name__ == '__main__':
    unittest.main()
