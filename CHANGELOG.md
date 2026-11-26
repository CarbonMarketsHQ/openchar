# Changelog

Changes to OpenChar, newest first. Each feature lists the automated tests that check it.

## Unreleased

### Reports
- A Reports page lists a report for each batch and one for each of the last six months.
- Batch reports include the ledger and its evidence, production and balance checks, feedstock, lab results, co-products, units and end use, and fuel.
- Monthly reports include intake, batches, emissions by scope, shifts, downtime, fuel, and calibrations.
- You can open any report as a printable page to save as a PDF from the browser, or download it as an Excel workbook with one sheet per record type.
- Tests: REP1 and REP2 in `evals/e2e/reports.spec.ts`.

### Trends
- A new Trends page charts each batch from oldest to newest: dry biochar yield, throughput per day and per shift, residence time, electricity per dry tonne and fuel per dry tonne. Total production is shown by month.
- All chart values come from records already in OpenChar. If a batch is missing a record needed for a value, the chart shows a gap instead of an estimate.
- The sidebar now groups Trends, Emissions, Compliance and Certify under Reporting.
- Tests: TR1 in `evals/e2e/trends.spec.ts`.

### Bio-liquid containers
- Co-products on a batch page can be packaged into drums, IBC totes, tanks or jerrycans. Each container is a unit with its own QR label and follows the same chain of custody as biochar bags: splitting, merging, delivery and use.
- Total packaged mass cannot exceed a co-product's declared mass, and biochar and bio-liquid cannot be merged into one unit.
- A container page shows what it holds (for example, bio-liquid grade 2 for wood vinegar) and which batch it came from.
- Tests: UN2 in `evals/e2e/units.spec.ts`.

### Mass and carbon balance
- Each batch page compares feedstock against measured outputs: biochar sent to the silo, biochar sent to other lines, and bio-liquids. Gas and water vapour make up the remainder unless gas is weighed.
- Checks flag measured outputs heavier than the feedstock and dry biochar yields below 15% or above 45%. When gas is weighed, checks also flag more than a 5% difference between feedstock and measured outputs.
- When feedstock carbon content and its source are recorded, the batch page shows how much of that carbon remains in the biochar. A carbon yield above 100% fails the check, and a yield below 25% or above 75% is flagged for review.
- Tests: BAL1 and BAL2 in `evals/e2e/balance.spec.ts`.

### Emissions by scope
- An Emissions page splits the plant's emissions by scope. Scope 1 is fossil fuel from the fuel log. Scope 2 is metered grid electricity multiplied by the project's grid factor. Scope 3 is road transport for feedstock collection and biochar delivery.
- It shows monthly totals over 3, 6, or 12 months, totals by source, and batch totals with emissions per dry tonne of biochar.
- This page is for reviewing plant emissions only and does not change batch ledgers. A batch ledger still counts only what a user applies to its run inputs.
- Tests: EMI1 in `evals/e2e/emissions.spec.ts`.

### Fuel and electricity
- A new Energy page records fuel by type (diesel, petrol, LPG, biomass) and use (reactor start-up, generator, loader, vehicle trip), linked to a batch or recorded separately. Emissions use IPCC 2006 default emission factors, and biomass is counted as biogenic.
- Cumulative electricity meter readings (kWh) can be entered manually, uploaded from a CSV file, or sent from a meter feed through the API. Electricity for a batch is calculated from the increase in its meter readings over the batch period.
- Each batch page shows its fuel and metered electricity next to the run inputs used by the ledger. An operator can apply them in one step. The ledger now includes a fuel line, and feedstock collection distances appear on their own line.
- Tests: ENG1 and ENG2 in `evals/e2e/energy.spec.ts`, and unit tests for the new ledger lines.

### Road distances
- Each consignment shows its road distance to the plant. Until the distance driven is recorded, it is calculated from the supplier and plant coordinates (straight-line distance multiplied by 1.3 for road travel) and marked as an estimate.
- Each batch page shows feedstock collection and biochar delivery separately, with the mass-weighted distance and tonne-kilometres for each.
- Each dispatch accepts either the destination coordinates or the distance driven.
- The transport line in the ledger still uses the batch's run inputs. You can replace them with the delivery distances in one step, and the ledger is never updated automatically.
- Tests: DIST1 and DIST2 in `evals/e2e/distances.spec.ts`.

### Duplicate records
- The Gate page flags possible duplicates: two consignments from the same supplier within 1% in mass and within 30 minutes of each other, the same weighbridge slip recorded for two lots, or two slips with the same mass entered within 2 hours.
- The Documents page flags any file uploaded more than once.
- The Compliance page shows a warning until a user marks a flagged pair as not a duplicate. Once marked, that pair is not flagged again.
- Tests: DUP1 and DUP2 in `evals/e2e/duplicates.spec.ts`.

### Calibration register
- A Calibration page lists every instrument whose readings are used in records (scales, thermocouples, and moisture, flow, energy and gas meters) and shows its last calibration, next due date and status.
- Recording a calibration sets the next due date from the instrument's calibration interval, unless the certificate has a different date. A failed calibration marks the instrument out of use.
- The Overview page highlights instruments due within 30 days. Both the Overview and Compliance pages list overdue instruments by name.
- Workspace admins can receive email alerts, sent once per instrument for each due date. Alerts are off unless `CALIBRATION_ALERT_EMAILS=1` is set on the server.
- Tests: CAL1 and CAL2 in `evals/e2e/calibration.spec.ts`.

### Shift log
- A Shift log page records who ran the reactor, when each shift started and ended, and what happened during it.
- Each shift ends with a handover note, and the latest note is shown at the top for the next operator.
- Downtime can be logged by cause (planned maintenance, breakdown, feedstock shortage, power outage, weather, quality hold or other). The page totals monthly downtime by cause. When downtime crosses into a new month, each month counts only its own minutes.
- Batches are matched to shifts by time, and each batch page lists the operators who ran it.
- Tests: SL1, SL2 and SL3 in `evals/e2e/shifts.spec.ts`.

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
