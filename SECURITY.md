# Security policy

OpenChar holds production records that carbon credits depend on, so we take
reports seriously.

## Reporting a vulnerability

Please report it privately through GitHub: on this repository, open the
**Security** tab and choose **Report a vulnerability**. Do not open a public
issue.

Include what is affected, how to reproduce it, and what an attacker could do
with it. We will acknowledge the report within three working days and keep
you informed until it is fixed. We are glad to credit you in the release
notes unless you would rather stay anonymous.

## Supported versions

Security fixes go into the latest release. Self-hosted servers should
upgrade as described in [docs/self-hosting.md](docs/self-hosting.md).

## How OpenChar is protected

[docs/security.md](docs/security.md) describes the controls in place:
password storage, sessions, rate limits, tenant isolation, the audit trail,
evidence integrity and backups.
