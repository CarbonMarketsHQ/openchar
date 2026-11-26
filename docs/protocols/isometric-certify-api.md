# Isometric Certify API: notes for the connector

What OpenChar's registry connector is built against, from Isometric's public
documentation read on 1 October 2026. Check the live documentation before
relying on any detail here.

## How OpenChar maps to Certify

| OpenChar | Certify object |
|---|---|
| The lots fed into a batch, with hopper and slip masses | Feedstock Batch |
| Production batch (run times, wet mass, moisture, location) | Production Batch |
| Lab samples, never composited | Measurement Samples |
| Reactor temperature series, aggregated to 60 seconds | Sensor, with a Parquet time-series upload |
| Ledger result (gross, durability factor, deductions, counterfactual, conservative net) | GHG Entry |

Uploading the evidence files as Sources, sending each ledger input as a
Datapoint with its standard deviation, grouping entries into a GHG Statement,
and sending soil applications as Biochar Applications are not built yet. The
feedstock type is sent as agricultural residue for every batch for now.

`POST /certify/preview/:batch` returns the payload without sending it.
`POST /certify/submit/:batch` sends it when `ISOMETRIC_API_KEY` and
`ISOMETRIC_CLIENT_SECRET` are set (`server/src/certify.ts`).

## Certify, the supplier-facing platform

Certify is Isometric's supplier-facing MRV/verification platform; the Registry
is the public credit ledger. Launched 18 Mar 2025.

- Product page (https://isometric.com/certify): supplier submits a project,
  eligibility confirmed "within approximately one week"; LCA prepared and
  submitted in-platform; evidence uploaded; automated data-quality checks;
  once verified, "certificates issue automatically on a monthly basis."
  Advertises an Open API for continuous MRV data flow so suppliers can keep
  their existing MRV software.
- Project creation (https://docs.isometric.com/user-guides/certify/create-project.md):
  title/description/country, pathway + certified protocol, modules, confirm.
  Biochar projects must choose a durability timeframe (200+ or 1000+ years)
  and a batch sampling method before uploading data; settings lock once
  validated.
- Review happens in a structured Log of Issues
  (https://docs.isometric.com/user-guides/certify/log-of-issues.md): issues
  raised at pre-screen (Isometric) and validation/verification (VVB),
  categorized per ISO 14064-3 (Clarification Request, Error, Misreport,
  Misrepresentation, Nonconformity, Omission) plus non-blocking Forward
  Action Requests; suppliers respond in comment threads.

## The API

Docs at https://docs.isometric.com (index: https://docs.isometric.com/llms.txt).
Two APIs: Certify API (submit data for verification) and Registry API
(query/deliver/retire credits). OpenAPI specs:
https://docs.isometric.com/api-reference/certify/mrv.openapi.json and
https://docs.isometric.com/api-reference/registry/registry.openapi.json.

- Base URLs: https://api.isometric.com/ (prod), https://api.sandbox.isometric.com/
  (sandbox, separate accounts). Auth: Bearer JWT + x-client-secret header.
  Credentials self-serve for account holders (suppliers, MRV partners,
  buyers); others request access via the partner form. ~120 req/min. No
  official SDKs; generate from OpenAPI.
  (https://docs.isometric.com/api-reference/introduction.md)
- Biochar-specific Certify endpoints: Feedstock Types/Batches, Production
  Batches, Biochar Applications, Measurement Locations and Measurement
  Samples (sample types: production batch, soil), Storage Locations/Units,
  Sensors, Monitoring Requirements/Submissions, Data Upload Submissions,
  File Upload, Sources, Datapoints, Components/Blueprints, GHG Entries,
  Removals, GHG Statements (incl. ghg-statement-submit).
- Core data model
  (https://docs.isometric.com/api-reference/certify/certify-introduction.md,
  https://docs.isometric.com/user-guides/certify/key-certify-concepts.md):
  Sources (evidence files) → Datapoints (single values, each with a standard
  deviation and references to sources) → Components (CO2e flux calculations
  from blueprint equations) → GHG Entries (from protocol templates; only
  monitored inputs submitted) → GHG Statements (contiguous groups of entries
  submitted for verification). Canonical 7-step flow:
  https://docs.isometric.com/api-reference/certify/your-first-ghg-entry.md
- Evidence formats
  (https://docs.isometric.com/api-reference/certify/uploading-sources.md):
  20+ types: PDF, DOCX, TXT, IPYNB, XLSX, CSV, JPEG/PNG/HEIC/TIFF, JSON,
  GeoJSON, Parquet, KML, GeoPackage, Shapefile. Upload via signed GCS URL,
  then attach source IDs to datapoints. Sources private by default.
- Sensor time-series
  (https://docs.isometric.com/user-guides/certify/time-series-data-upload.md):
  Parquet only, ≤100 MB/file, fixed column schema (aggregation period
  start/end, sensor_reference, min/max/mean/median, count, standard
  deviation, first/last timestamp), aggregation periods ≤60 seconds.
  Biochar pyrolysis reactors are an explicitly supported facility type
  (compound mass fractions, pressure, temperature). Flow: create sensor →
  signed URL → upload Parquet → submit → poll status.
- MCP server at https://api.isometric.com/mcp (OAuth, Streamable HTTP): reads
  protocol and project data and comments on issues
  (https://docs.isometric.com/user-guides/ai/mcp-server.md).
