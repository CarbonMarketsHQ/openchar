# Changelog

Changes to OpenChar, newest first. Each feature lists the automated tests that check it.

## Unreleased

### Workspace copy
- Admins download a full copy of the workspace from the Account page: every table as JSON and CSV, and every uploaded file, in one ZIP file. Passwords and sign-in sessions are not included.
- `npm run admin -- import-workspace` loads the copy into another OpenChar server. It checks every file against its SHA-256 hash and prints a link for each person to set a new password.
- Tests: EX1, EX2 and EX3 in `evals/e2e/export.spec.ts`.

### Documents
- Upload documents by type: supplier declaration, land record, invoice, weighbridge slip, lab certificate, calibration record, permit or other.
- Attach each document to the consignments, lots, batches or facilities it supports. One document can be attached to several records.
- The Documents page lists every document with its type, attached records and file. Filter the list by type or by record. Each batch shows its own documents.
- Files are stored by their SHA-256 hash (a file fingerprint), and the hash is shown with each document.
- Tests: DOC1 and DOC2 in `evals/e2e/documents.spec.ts`.

### Fixes
- Unit custody events are now shown in plain language.
- The field app title stays on one line when the phone goes offline.
