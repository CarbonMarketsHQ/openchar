# Eval charter

The definition of done for OpenChar. Each eval below states what it proves,
and the build is complete when every one passes. Automated evals live beside
this file (`evals/e2e/`, Playwright against a production build) and in
`server/test/` (ledger fixtures and configuration checks, Vitest). Manual
checks are marked MANUAL.

Sources of authority:
- Isometric Biochar Production and Storage v1.3 and its modules
  (docs/protocols/isometric-biochar-v1.3.md; requirement IDs are Isometric's)
- Isometric Certify API shapes (docs/protocols/isometric-certify-api.md)
- The design system in web/src/design/ and its type-scale floor: 13 px
  minimum for any sentence
- How industrial plants work in practice: hot trials before continuous
  operation, crop residue that would otherwise decay (with photo evidence),
  temperature exports from the PLC, hopper and silo scales checked against
  nearby weighbridge slips, lab results that arrive weeks after sampling,
  several buyers and an activation line that earns no credits, bio-liquids in
  several grades, and collection points that work offline and sync at the
  plant.

## 1. Ledger engine (server/test/ledger.test.ts: numerical fixtures)

Hand-computed expectations, derived from the protocol text independently of
the implementation. Tolerance 1e-6 relative unless stated.

- L1 Stored CO2e: wet mass 1250 kg at 18% moisture, Corg 78% of dry mass →
  dry mass 1.025 t, carbon 0.79950 t, gross stored CO2e = 0.79950 ×
  44.01/12.01 = 2.929725... t. Engine must match.
- L2 Durability (200-yr, Woolf params a=-0.383, b=0.350, c=-0.048):
  T_soil 27.0°C, H/Corg 0.42 → F_durable = 1 − (−0.048 + (−0.383 +
  0.350·ln 27)·0.42) = 0.724372... Engine must match, and must cap at 0.95
  (H/Corg 0.05, T 7°C → raw value above cap ⇒ 0.95) and floor T_soil at
  7°C (input 4°C computes as 7°C).
- L3 Durability gates: H/Corg ≥ 0.5 or O/Corg ≥ 0.2 ⇒ batch ineligible,
  zero creditable tonnes, explicit gate failure reason.
- L4 Moisture: dry mass = wet × (1 − moisture); moisture outside [0, 0.5]
  rejected as implausible (anomaly, not silent acceptance).
- L5 Deductions: transport = distance_km × mass_t × factor; electricity =
  kWh × grid factor; deductions subtract from gross; net can not go below
  zero without an explicit flag.
- L6 Counterfactual: CC3 decay-within-15-years argument ⇒ counterfactual
  0, but the engine output must carry the assumption as a labelled line
  ("pending Isometric assessment"), never silently.
- L7 Uncertainty: every input datapoint carries an SD; the reported
  creditable figure is the conservative (16th percentile) estimate, always
  ≤ the mean estimate; output includes both.
- L8 Blending: two batches blended into one storage lot use mass-weighted
  Corg and H/Corg (fixture with two unequal batches, hand-computed).
- L9 Provenance: every line in the calculation output names the datapoint
  ids it consumed; no orphan numbers.
- L10 Requirement mapping: engine's compliance report includes R-6YSW-0,
  G-F74T-0, G-2W0F-0, R-ADXG-0, G-KQSC-0, G-7CN1-0, G-1CDW-0, R-TKNH-0,
  G-6VWJ-0, R-8W08-0 with pass/warn/fail states computed from data, not
  hardcoded.

## 2. API (exercised through the web app and directly)

- A1 Health: GET /health returns ok + db round-trip.
- A2 Auth: every non-health route rejects a missing/wrong bearer token
  (401) and accepts the configured one.
- A3 Seed integrity: after `npm run seed`, the demo project exists with ≥3
  suppliers, ≥6 consignments, ≥3 production batches (one open hot trial,
  one closed+sampled, one closed awaiting lab), telemetry on the sampled
  batch, 3 samples on the sampled batch (G-F74T-0 count), 1 lab
  certificate, co-products in three bio-liquid grades, ≥1 dispatch and ≥1
  application event with farm polygon, and sync batches whose hash chain
  verifies.
- A4 Hash chain: tampering with a stored field event (direct DB update in
  the eval) makes the chain verification endpoint report the break
  (R-8W08-0 tamper evidence).
- A5 Anomaly flags: the seeded telemetry includes a mid-run temperature
  dip below the pyrolysis floor; the batch's anomaly list is non-empty and
  names the window (R-8W08-0 automatic anomaly flagging).
- A6 Certify payload: POST .../certify/preview for the sampled batch
  returns a payload whose shapes match Certify objects (feedstock batch,
  production batch, measurement samples kept separate (not composited),
  sensor series reference, GHG entry values equal to the ledger
  outputs).

## 3. Web app, scene by scene (Playwright, local full stack)

The path of a tonne (docs/architecture.md), one scene per E2E spec:

- W1 Field capture offline: at 390px viewport, with the page loaded and
  network then dropped (context.setOffline), a consignment can be
  captured (supplier, est. mass, moisture, photo placeholder, GPS fix,
  source category "crop residue"); it lands in a local outbox with a
  SYNC PENDING state and a tamper-evident timestamp visible; going online
  and pressing Sync moves it to the server (appears in the plant console
  gate list). The app must not lose the record on reload while offline.
- W2 Gate: the synced consignment can be attached to an intake lot with a
  weighbridge-slip mass entry; the lot shows hopper-scale and
  weighbridge-slip masses side by side with their difference.
- W3 Batch and telemetry: a production batch page shows status, masses,
  duration, and a temperature chart rendered from the seeded CSV; the
  anomaly window is visibly marked on the chart and listed; batch age
  against the <1 month rule is shown (R-6YSW-0).
- W4 Lab: the sampled batch shows 3 samples with ids and states; the lab
  certificate values (Corg, H/Corg, O/Corg, moisture) render with a link
  to the certificate source; quality gates show pass with the measured
  margins (H/Corg 0.42 < 0.5; O/Corg < 0.2).
- W5 Ledger: the batch ledger page shows gross stored, durability factor,
  deductions, counterfactual line (labelled assumption), conservative
  creditable tonnes equal to fixture L1/L2 arithmetic; expanding a line
  reveals the datapoints and their evidence links (W9 checks one deep).
- W6 Compliance: a requirements table renders the IDs from L10 with
  computed states; the seeded project's gaps render as warn/fail with
  action text: on-site calibrated weighbridge absent (slips + hopper/silo
  scales instead), lab results pending, application evidence pathway in
  design, activation line excluded from crediting.
- W7 Certify connector: the connector page shows the mapped payload
  (pretty-printed), a sandbox/mock mode banner, and a submit that records
  a submission with timestamp and payload hash.
- W8 Public page: unauthenticated route shows project name, SYNTHETIC
  DATA badge, headline tonnes (conservative), batch count, district-level
  map/locator without farm coordinates, and no links into the console.
- W9 Evidence deep link: from the ledger, one click chain reaches the
  weighbridge slip / certificate source record (provenance end to end).
- W10 (superseded by section 6): an early passcode gate became real
  authentication; see AU1-AU3.

## 4. UX and craft (Playwright + axe + manual)

- U1 axe: no serious/critical violations on gate, batch, lab, ledger,
  compliance, public pages in both field (dark) and paper (light) modes.
- U2 Type floor: no rendered text node below 13px font-size on the audited
  pages except elements explicitly classed as stamps (--t-micro usage).
- U3 Keyboard: the demo path W2→W7 is operable with keyboard only
  (focus visible at every stop; no trap); dialogs close on Escape.
- U4 Responsive: field app audited at 390px; console usable at 1280px and
  1440px without horizontal scroll; public page fine at both.
- U5 Empty and error states: a route asked for a missing id renders a
  designed empty state (not a crash or raw error); API-down renders a
  designed failure notice on console pages (eval kills API and loads).
- U6 SYNTHETIC badge: visible on every console page and the public page
  while the seed profile is marked synthetic.
- U7 MANUAL: screenshot pass over the six demo scenes checking alignment,
  overlap, contrast in both themes, before the demo is called ready.

## 6. Writes, auth and tenancy (auth.spec, writes.spec, api.spec A2b/A7)

The platform is writable end to end, with real accounts and hard tenant
isolation:

- AU1 login: console redirects to /login; wrong password shows an error;
  right credentials land on the console with the synthetic badge (the demo
  project is synthetic).
- AU2 sign-out locks the console again.
- AU3 signup creates a new workspace through the UI; the fresh tenant sees
  empty states, cannot reach another tenant's batch by URL, and can create
  its first project through the dialog.
- A2b API-level isolation: a foreign session asking for the demo project
  gets 404; its project list is empty.
- A7 evidence files round-trip: multipart upload, metadata, download.
- WR1 supplier registration through the dialog, with capitalized labels.
- WR2 recording a facility stack test flips R-TKNH-0 to pass.
- WR3 the full batch lifecycle through the UI: open with code and facility,
  telemetry CSV upload rendering the chart and its anomaly, sample
  registration, close (status Awaiting lab), certificate entry (status
  Sampled), run inputs, co-product declaration.
- WR4 the ledger computes from the entered values (gross ≈ dry mass ×
  Corg × 44.01/12.01, conservative below gross).
- WR5 dispatch then soil application close the end-use loop on screen.
- WR6 the new batch flows into certify submissions.
- U8 the Batches and Field-app sidebar icons are distinct drawings.
- U9 no status badge renders a lowercase slug.
- AU9 rate limits and the audit trail key on the visitor: a relayed
  address lands on the trail, a malformed one is ignored, and one visitor
  exhausting the auth limit gets 429 while another still gets through.
- B1 backup freshness on the Account page: no run on record warns, a run
  three hours old reads fresh with its offsite state, a run a night late
  reads late.
- C1 (server/test/deploy-config.test.ts) every environment variable the
  server reads is passed to the API container by docker-compose.yml.

## 5. Deployment acceptance (smoke checks after a deploy, MANUAL)

- D1 the web answers 200 on /login on its production domain.
- D2 the API answers /health with a database round-trip, and is not
  reachable from the internet except through the web app or a proxy you
  chose.
- D3 a real sign-in through the web records the visitor's address, not the
  proxy's, on the audit trail.
- D4 `docker compose ps` shows every service up; the backup timer is
  enabled and a manual run records a backup.
- D5 secrets: the service token lives only in the server's environment,
  never in the repo; Postgres has no public port.

## 7. Self-hosting (selfhost.spec)

- SH1 an admin adds a teammate with no password; an invite link appears,
  no password signs the account in until the link is used, and the
  teammate sets their own password through it.
- SH2 a project's public summary answers only while an admin has it
  published; unpublishing takes it down at once.
- SH3 the API tells the sign-in screens its sign-up policy (closed by
  default, open in the eval environment).

## Not covered yet (recorded so the evals don't pretend)

- Submission against a live Isometric account (the connector previews and
  records submissions; it calls the real API only with credentials).
- Parquet sensor upload to Certify (payload references the series; the
  60s-aggregation export exists as a server function, not wired to a real
  endpoint).
- PDF extraction of lab certificates (values are entered by hand; reading
  certificates automatically is on the roadmap).
- Real soil-temperature database lookup (site profile carries T_soil with
  its source labelled).
