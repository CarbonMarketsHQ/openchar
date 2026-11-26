# How OpenChar works

OpenChar keeps its two applications and its tests in one repository:

```
server/   the API (Fastify on Node.js): Postgres access, the carbon ledger, the registry connector
web/      the web app (Next.js): the plant console, the field app and public project pages
evals/    browser tests (Playwright), and the charter that lists what each test proves
```

## From feedstock to carbon credit

A carbon credit depends on the chain of records under it, so OpenChar is
organised around that chain.

1. **Feedstock arrives:** at the collection point, the field app records a
   consignment with its supplier, estimated mass, moisture, feedstock
   category, GPS position and a photo. On a phone without signal, the record
   waits on the device and syncs when there is signal again. Each synced
   record is added to the project's event log (`field_events`) together with
   a cryptographic fingerprint (hash) of the record before it, so an earlier
   entry cannot be changed without the change being detected.
   `GET /chain/verify` checks the whole chain.
2. **Feedstock is weighed into lots:** at the gate, consignments are grouped
   into lots, and the lot's hopper-scale mass is recorded next to the
   weighbridge slip, with the difference shown.
3. **A batch runs:** an operator opens a production batch and assigns lots
   to it. The batch collects reactor temperatures (CSV upload or a live MQTT
   feed), co-products such as bio-oil and wood vinegar, and operating inputs
   (transport distance and tonnage, and electricity). A temperature drop
   during the hold period, when the reactor must stay at pyrolysis
   temperature, is flagged automatically.
4. **The batch is sampled:** samples get labels and a chain of custody to the
   lab. The lab results (organic carbon, the hydrogen-to-organic-carbon and
   oxygen-to-organic-carbon ratios H/Corg and O/Corg, and moisture) are
   entered for the batch and checked against the protocol's limits.
5. **The ledger calculates:** the carbon ledger turns the batch's records and
   lab results into net stored CO2e, as described in the next section.
6. **Biochar leaves:** finished biochar is divided into units (bags or silo
   lots), each with a QR code. Units can be split or merged, and the masses
   must add up. They are then dispatched and spread on farmland. The custody
   chain links each soil application back to its production batch.
7. **The registry gets its data:** the connector maps the batch, its samples,
   its sensor series and its ledger result to Isometric Certify objects, and
   submits them when credentials are set.

Every uploaded file (a slip photo, a certificate, a calibration record)
becomes a source with its SHA-256 fingerprint, and records point to their
sources. Identical files are stored once.

## The ledger

`server/src/ledger/` is the quantification core of Isometric's Biochar
Production and Storage protocol v1.3. It has no database or network code, so
it can be read and tested on its own. For each batch it computes:

- Dry biochar mass (from wet mass and moisture), organic carbon, and gross
  stored CO2e (carbon × 44.01/12.01, the ratio of the molar masses of CO2
  and carbon).
- The fraction that stays stored for 200 years, from the Woolf et al. (2021)
  model, at the project's soil temperature and the batch's H/Corg. The
  protocol sets a minimum soil temperature of 7 °C for the model and caps the
  fraction at 0.95.
- Deductions for transport and electricity emissions, and for the
  counterfactual (carbon the feedstock would have kept stored anyway without
  the project).
- A mean net removal, and a conservative figure at the 16th percentile
  calculated from the standard deviations recorded on the inputs.

Each output line lists the input values it used, and each input value links
to the evidence files behind it. That is how a user or a verifier can open
any number in the console and trace it to a weighbridge slip or a lab
certificate. The rules cite the protocol's requirement IDs (R-xxxx, G-xxxx),
and the compliance view checks those requirements against the project's
records. [protocols/isometric-biochar-v1.3.md](protocols/isometric-biochar-v1.3.md)
records how the code interprets the protocol.

The ledger's tests in `server/test/ledger.test.ts` use expected values
worked out by hand from the protocol text, not taken from the code.

## Accounts and access

- A **workspace** is one organisation. It owns **projects**, and a project
  owns its facilities, suppliers, batches and records. Every request carries
  a session and a project, and the API checks that the project belongs to the
  session's workspace before it reads or writes anything.
- **Roles:** admin (manages the team and settings), member (records data),
  and verifier (sees everything in the workspace and changes nothing). The
  verifier restriction is enforced in the API, not only hidden in the UI.
- Passwords are stored as scrypt hashes, never as text, and sessions last 30
  days. Sign-in attempts are rate limited per IP address. Failed sign-ins are
  logged, and five failures for the same email address within 15 minutes
  create an alert in the admin's audit trail.
- The browser never calls the API directly. The web app's server holds a
  service token and forwards each request with the user's session, so the API
  can stay on a private network.

## Extending OpenChar

**Registry connectors.** The core data model is registry-neutral. The
Isometric connector (`server/src/certify.ts` and `buildCertifyPayload` in
`server/src/report.ts`) is a mapping from that model to one registry's
objects, and connectors for other registries follow the same pattern.

**Extensions.** A deployment can load extra API code without changing this
repository. Set `OPENCHAR_EXTENSIONS` to a comma-separated list of modules.
Each module exports `register(app, api)`, which runs once at start-up. It can
add API routes, register its own mailer with `api.setMailer()`, or let
requests without a user session reach a route prefix with
`api.allowWithoutSession(prefix)`. See `server/src/extensions.ts`. On the web
side, `web/src/ext/` holds optional extension points that a custom build can
replace, such as extra links in the console navigation. The hosted service
uses these hooks for its sign-up flow and email delivery. A self-hosted server
does not need any extensions.

## Data model

Postgres tables, created and migrated by the API at start-up
(`server/src/db.ts`):

| Area | Tables |
|---|---|
| Accounts | `workspaces`, `users`, `sessions`, `password_resets`, `auth_events` |
| Projects and setup | `projects`, `facilities`, `suppliers`, `sources` |
| Feedstock | `field_events` (the hash-chained log), `consignments`, `lots` |
| Production | `batches`, `telemetry`, `co_products`, `batch_ops` |
| Lab | `samples`, `certificates` |
| Custody and end use | `units`, `unit_parents`, `unit_events`, `dispatches`, `applications` |
| Registry and operations | `certify_submissions`, `backup_runs` |
