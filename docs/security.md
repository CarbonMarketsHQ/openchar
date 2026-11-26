# Security controls

This page lists the security controls built into OpenChar and, where one
exists, the automated test that proves each control. The test IDs (such as
AU4) are explained in [evals/CHARTER.md](../evals/CHARTER.md). The controls
apply to every installation. Operating decisions, such as where the server
runs, who holds its secrets and where off-site backups go, are the
responsibility of whoever runs it.

## Accounts and sessions

- Passwords are hashed with scrypt (16-byte salt, 64-byte key).
- Sessions are random 256-bit tokens that expire after 30 days. They are kept
  in cookies that browser scripts cannot read (httpOnly), that are not sent
  on most cross-site requests (SameSite=Lax), and that travel only over HTTPS
  in production (Secure). The API checks the session on every data request.
- Changing a password requires the current one and signs out every other
  session (eval AU4). Reset links are single-use, stored only as SHA-256
  hashes, expire after 30 minutes, and sign out every session when used
  (eval AU5). Invite links work the same way and last seven days (eval SH1).
- Sign-up is closed by default: only the first account can be created that
  way, and admins invite everyone else.
- Sign-in, sign-up and password reset are rate limited per IP address
  (`AUTH_RATE_MAX`, default 15 a minute). The web app passes the visitor's IP
  address to the API, and the API trusts it only when it comes with the
  service token. One visitor who goes over the limit therefore cannot lock
  out anyone else (eval AU9).

## Workspace isolation

- All data belongs to a workspace through its projects. On every request for
  project data, the API checks that the project belongs to the signed-in
  user's workspace. A request for another workspace's project gets
  "not found", so it does not even reveal that the project exists (evals A2b,
  AU3).
- The verifier role is read-only in the API itself, not only in the UI.
- A project's public page exists only while an admin has published it
  (eval SH2).
- The field event hash chain is per project, so each project's evidence
  trail verifies on its own.

## Network

- The browser never calls the API directly. The web app's server holds a
  service token and forwards each request with the user's session, so the API
  and the database do not need to be on the public network. In the default
  compose file, the database, the API and the web app all listen on
  localhost only.
- The service token can be replaced without stopping the service: put the
  old token in `API_TOKEN_PREVIOUS`, and the API accepts both while the web
  app restarts with the new one (eval A2c).

## Evidence integrity

- Uploaded files are stored under their SHA-256 fingerprint, and downloading
  a file requires a signed-in user with access to the project that owns it.
- Each field record carries its capture time and the hash of the record
  before it, which makes a tamper-evident chain. `GET /chain/verify`
  recalculates the chain and reports the first record that does not match
  (eval A4).
- Every calculated removal figure traces back to its input values and their
  evidence files, and a hash of each registry submission is recorded when it
  is made.

## Audit trail

- Account events are logged with the time, the email address and the IP
  address: successful and failed sign-ins, sign-ups, invitations, password
  changes, resets requested and completed, and reset or setup links created
  from the command line. Admins see only their own workspace's log (evals
  AU6, AU9).
- Five failed sign-ins for one email within 15 minutes raise an alert on that
  trail (eval AU8).

## Backups and recovery

- `deploy/backup/` holds a nightly backup script (the database and the
  evidence files, the last seven kept, with an optional copy to S3) and a
  restore test that restores the latest backup into a temporary database and
  compares row counts with the live one.
- Each successful backup is recorded, and the Account page warns admins when
  a night is missed (eval B1).
- The sample-data script stops if the database already holds a workspace, so
  sample data can never overwrite real records.

## Known gaps

- Email for resets and invites needs a mailer configured. Without one, links
  go to the API log and to the inviting admin.
- Alerts stay inside the application. Nothing forwards them to an external
  monitoring system yet.
- Field-only and operator roles, and two-factor sign-in, are on the
  [roadmap](roadmap.md).
- The software has no formal security certification.

To report a vulnerability, see [SECURITY.md](../SECURITY.md).
