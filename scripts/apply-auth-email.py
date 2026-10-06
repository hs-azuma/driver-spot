"""Apply and read back only the production signup email settings. Never log secrets."""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

PROJECT = "wyxuekjikvflpcmlliwn"
ENDPOINT = f"https://api.supabase.com/v1/projects/{PROJECT}/config/auth"
TEMPLATE_KEYS = {"mailer_subjects_confirmation", "mailer_templates_confirmation_content"}
SMTP = {"smtp_host": "smtp.resend.com", "smtp_port": "465",
        "smtp_user": "resend", "smtp_admin_email": "noreply@spodora.com",
        "smtp_sender_name": "スポドラ"}


class ConfigurationError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_config(token, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(ENDPOINT, data=data, method=method,
                                 headers={"Authorization": f"Bearer {token}",
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not expose the response body, request headers, or SMTP credentials.
        raise ConfigurationError(f"Supabase Auth API failed (HTTP {error.code}).") from None
    except (urllib.error.URLError, ValueError, TimeoutError):
        raise ConfigurationError("Supabase Auth API connection or response failed.") from None


def apply(template, env, api=request_config):
    if set(template) != TEMPLATE_KEYS or not all(isinstance(v, str) and v for v in template.values()):
        raise ConfigurationError("Confirmation template must contain exactly the two permitted fields.")
    if '{{ .ConfirmationURL }}' not in template['mailer_templates_confirmation_content']:
        raise ConfigurationError("Confirmation URL placeholder is missing.")
    token = env.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        raise ConfigurationError("Setup required: add SUPABASE_ACCESS_TOKEN to repository Actions secrets.")
    current = api(token)
    patch = {key: value for key, value in template.items() if current.get(key) != value}
    bootstrap = not current.get("smtp_host")
    if bootstrap:
        key = env.get("RESEND_AUTH_API_KEY", "").strip()
        if not key:
            raise ConfigurationError("Custom SMTP is not configured. Add RESEND_AUTH_API_KEY to Actions secrets.")
        # Verified sending domain: spodora.com. Preserve all signup/security/redirect settings.
        patch.update(SMTP)
        patch["smtp_pass"] = key
    if patch:
        api(token, "PATCH", patch)
    verified = api(token)
    expected = {**template, **(SMTP if bootstrap else {})}
    if any(str(verified.get(k)) != str(v) for k, v in expected.items()):
        raise ConfigurationError("Auth email settings were not confirmed by read-back. Inspect configuration before retrying.")
    print("Japanese signup email settings verified." if patch else "Japanese signup email settings already match; verified.")
    print("SMTP configured; delivery to an inbox still requires a separate signup email test.")


def main():
    path = Path(__file__).resolve().parents[1] / "supabase/templates/confirm-signup-ja.json"
    try:
        apply(json.loads(path.read_text(encoding="utf-8")), os.environ)
    except ConfigurationError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
