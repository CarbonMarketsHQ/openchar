# Changelog

Changes to OpenChar, newest first. Each feature lists the automated tests that check it.

## Unreleased

### Documents
- Upload documents by type: supplier declaration, land record, invoice, weighbridge slip, lab certificate, calibration record, permit or other.
- Attach each document to the consignments, lots, batches or facilities it supports. One document can be attached to several records.
- The Documents page lists every document with its type, attached records and file. Filter the list by type or by record. Each batch shows its own documents.
- Files are stored by their SHA-256 hash (a file fingerprint), and the hash is shown with each document.
- Tests: DOC1 and DOC2 in `evals/e2e/documents.spec.ts`.

### Fixes
- Unit custody events are now shown in plain language.
- The field app title stays on one line when the phone goes offline.
