# Company signup email confirmation (2026-10-13)

New company registrations require a real email address. The account-auth endpoint
creates the auth user with email_confirm=false, stores the validated company
profile in pending_company_registrations, links the login ID/recovery hash and
sends Supabase's signup confirmation email using auth.resend. It returns a pending
response without a session. The frontend shows pending registration and preserves
the recovery code; passkey setup is not offered until registration completes.

Supabase verifies the one-time email link and redirects to company-register.html.
The private auth.users trigger atomically creates the company profile from the
service-owned pending record when email_confirmed_at is set, then removes that
pending record. The existing callback session opens the company portal.

New company profile insertion is blocked without a confirmed matching auth email.
Existing company profiles retain their access and edits. Driver registration,
optional driver emails and immediate driver login are unchanged.

Resend is available from the pending screen and company login screen, including
expired-link recovery. Server per-email resend limit: 3/hour. The UI additionally
requires 60 seconds between successful resends. Send failure retains the pending
registration so the user can retry. Confirmation secrets are not returned to the
browser by account-auth. No SMS is introduced.

Verified: mocked signup/helper tests, script parsing, transaction-rolled-back DB
test of pre-confirmation denial and once-only completion. Production inbox receipt
must still be checked by making a real registration; no user inbox test email was
sent during development.
