# Restore the current view on refresh (2026-10-13)

Dynamic views now persist their route and filters in URL query parameters via
assets/page-state.js. Reload, including Safari pull-to-refresh, fetches fresh
data and restores that view instead of always opening the initial list.

- Driver: profile, work tabs, invitations, job-list view/date/company and detail ID.
- Company: jobs/drafts and status; applicants/favorites/blocks, job and status;
  attendance filter and selected month; registration/login/resend/confirmation.
- Standalone profile-edit, scan and QR pages already have dedicated URLs.

Query values are validated against allowlists. No password, recovery code or
profile fields are persisted by the route helper. The pending-company email is
stored only in the same tab's sessionStorage so the confirmation/resend screen can
be restored; it is removed when registration opens the company portal.

Driver auth/profile fetch failures are explicit errors rather than guest state.
Company auth-fetch failures show an error rather than redirecting to registration.
This does not resurrect an expired or explicitly signed-out session. It does not
save unsaved form edits or restore transient confirmation dialogs.

Validation: seven Node tests including actual driver entry dispatch and auth
network-error handling, plus script parsing on all five changed pages. Physical
iPad pull-to-refresh has not been exercised during this change.
