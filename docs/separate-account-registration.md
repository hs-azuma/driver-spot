# Separate driver and company registration (2026-10-13)

New driver and company registrations use different auth users. Existing jobs,
applications, attendance, notifications, IDs and RLS ownership remain unchanged.
SMS is not enabled: this release retains login IDs, optional email, passwords,
passkeys and recovery codes. Login IDs and actual auth emails remain globally
unique, so users registering both kinds must choose separate IDs and, if supplied,
separate emails.

The public account-auth endpoint rejects mixed driver/company profiles and
creates the company profile before returning a successful company signup session.
Driver profiles continue to be created by the existing auth-user trigger.
Profile creation errors clean up only the newly created account.

The private database trigger serializes profile writes by locking the auth-user
row, blocks adding the opposite profile and prevents changing profile ownership.
Existing dual-profile accounts are grandfathered: existing profile upserts and
updates remain usable. They are not automatically split or deleted, because that
would change existing record ownership and require an account migration.

The frontend removes the add-company-to-driver-account flow. Password and passkey
logins check persisted profile ownership and reject the opposite account kind.
Wrong-kind login sessions are signed out locally, leaving other devices alone.
Existing unfinished accounts with no profile may finish one profile.

Validation: 19 Node tests; inline HTML script parsing; transaction-rolled-back DB
verification of both blocked cross-profile insert directions and existing dual
profile updates. No SMS or notification was sent by these checks.
