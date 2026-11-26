# Isometric Biochar Production and Storage v1.3: requirements digest

A working digest of the protocol that OpenChar's ledger implements, read on
1 October 2026. Requirement IDs (R-xxxx and G-xxxx) are Isometric's own,
from https://registry.isometric.com/requirements/biochar, and the code cites
them where it implements them. This digest is a reading aid, not the
protocol: where they differ, the protocol wins, and corrections are welcome.

## 1. Protocol identity

- Biochar Production and Storage, v1.3:
  https://registry.isometric.com/protocol/biochar/1.3, under Isometric
  Standard v2.1 (https://registry.isometric.com/standard/2.1).
- Modular architecture a platform must model:
  - Biomass Feedstock Accounting Module v1.3
  - GHG Accounting Module v1.1; Energy Use Accounting Module v1.3
  - Storage: Biochar Storage in Soil Environments v1.3; Low Oxygen Burial
    (US/CA/UK/EU only); Built Environment (concrete/asphalt)
  - Production: Combustion Co-product Systems v1.0; Distributed and
    Small-Scale Projects v1.0
  - CRCF Isometric Biochar Requirements v1.0 (EU 2024/3012 alignment)
- v1.3's exact certification date is not surfaced publicly; ask Isometric.

## 2. Eligibility

- Five eligible feedstock categories: forestry residues and wood-processing
  residues; agricultural residues; industrial residues; designated municipal
  wastes; invasive species under a managed harvest plan.
- Ineligible: purpose-grown bioenergy feedstock has no path through the
  module (PF1); feedstock must not be suitable for long-lived wood products
  or pulpwood (PF2). Wood-processing residues qualify if non-marketable or
  marketed only for bioenergy/landscaping/mulch over the prior 2 years.
- Some feedstocks are not named in the module (bamboo is one). Residue from
  existing cultivation plausibly qualifies as crop residue (SC3: land
  agricultural ≥5 years before first procurement); a purpose-grown crop would
  not. Confirm the classification with Isometric before procurement starts.
- Crop residues cannot come from the same acreage in consecutive years
  unless ≥5 years of monocropping is shown. Forestry residues need FSC/PEFC
  or equivalent risk assessment plus stable-or-increasing forest carbon
  stocks over 5 years in the sourcing region.
- Counterfactual: 3 pathways. CC1 (ecosystem sequestration) and CC2
  (government wildfire mitigation) give counterfactual = 0. CC3: quantify
  biogenic carbon that would have stayed durably stored absent the project,
  over a 15-year window with 100-yr GWPs; if all stored carbon would be
  emitted within 15 years (e.g. burned as fuel), counterfactual = 0.
  Evidence: 5 years of historical/purchase records, economic-viability
  assessment, or supplier affidavit.
- Penalty: ineligible biomass above 25% of feedstock mass in a Reporting
  Period voids crediting for the entire period.
- Technology: slow and fast pyrolysis both eligible; no reactor type
  mandated; reactor design and engineering diagrams go in the PDD. The
  distributed module excludes unmodified pit / flame-curtain / Kon-Tiki
  kilns. Small-scale = each facility <500 t biochar nominal annual capacity
  (a 20 tonne-per-day biomass plant exceeds this, so the core protocol applies).
- Geography: soil storage is unconstrained.

## 3. Quantification

Core: CO2e_Removal,RP = CO2e_Stored,RP − CO2e_Counterfactual,RP − CO2e_Emissions,RP

- Stored carbon per production batch: C_biochar (organic carbon wt%, total C
  minus inorganic) × dry mass × 44.01/12.01. Blended storage batches use the
  mass-weighted sum. At storage the durable fraction multiplies in.
- Durability gates: H/Corg < 0.5 and O/Corg < 0.2 (ISO 29541:2025,
  ISO 16948:2015 or ASTM D5373-21).
- 200-year option: F_durable,200 = min(0.95, 1 − [c + (a + b·ln(T_soil))·H/Corg])
  with a = −0.383, b = 0.350, c = −0.048 (17th percentile of Woolf et al.
  2021). T_soil = average annual soil temperature at the storage site,
  floored at 7°C minimum, from measurement (ISO 4974) or a global database
  (Lembrechts et al. 2022). Note for India: warm soils (~25-29°C) push
  F_durable down, so low H/Corg is worth real money. Verify the equation
  against the module text before hard-coding (transcribed via extraction).
- 1,000-year option (unique to Isometric): inertinite-based, random
  reflectance R0 ≥ 2% (ISO 7404-5:2009), minimum 500 maceral-level
  measurements per sample, mean minus one SD; reactive organic carbon
  (separated by TGA) excluded.
- Emissions: establishment + operations (feedstock cultivation/harvest/
  transport, pyrolysis and processing energy, spreading, embodied emissions,
  directly measured pyrolysis gas emissions) + end-of-life + leakage.
  Materiality relief where a source is <1% of net removals (R-MF57-0).
  Every co/by-product must be declared with allocation procedures
  (R-3MBJ-0); substitution-based claims carry a 50% uncertainty discount
  (G-JX8D-0).
- Leakage: market leakage tests ML1-ML7 (e.g. ML5: excess local supply with
  price ≤5% of supplier's revenue from the feedstock → leakage 0), plus
  activity-shifting and ecological leakage.
- Uncertainty (Standard v2.1): conservative estimates at ≤16th or ≥84th
  percentile via conservative parameters, variance propagation, or Monte
  Carlo; sensitivity analysis with every GHG Statement.

## 4. Monitoring and sampling

- Sampling: Method A (every batch): ≥3 independent samples per batch,
  representative of particle size/color/texture, submitted separately, no
  compositing; minimum 30 initial samples (G-F74T-0). Method B (ongoing):
  ≥1 batch in every 10 sampled (G-2W0F-0), only after demonstrating
  consistent production temperatures and residence times.
- Production batch defined as < 1 month of output (R-6YSW-0).
- Lab analyses: organic carbon (ASTM D5291 or equivalent); H/Corg and O/Corg;
  heavy metals vs local or EU/US EPA limits; PAHs and pollutants within
  World Biochar Certificate (WBC) upper bounds. Labs must conform to
  ISO 17025 or equivalent; sample prep per ISO 13909-4:2025 (G-YGMA-0).
- Mass: feedstock in and biochar out weighed per batch on calibrated scales;
  applied biochar via legal-for-trade truck scales (protocol §8.4).
- Moisture: one of three regimes (R-ADXG-0 family): dry-weight measured
  every batch; consistent wetting to target with SEM < 5%; or moisture
  measured every batch. Feedstock side: documented moisture management
  before each run (R-NJ8G-0).
- Production logging: temperature sensor in the pyrolysis chamber or flue
  stack on every unit, logging through production (G-KQSC-0); batch duration
  timer (G-7CN1-0); GPS location of every unit at run start (G-1CDW-0).
- Stack emissions: CEMS or periodic testing at minimum once per year
  (R-TKNH-0); CO2, CH4, N2O.
- Feedstock tracking: chain-of-custody evidence to sources; sustainability
  criteria re-evidenced every Reporting Period; baselines from purchase
  records or supplier affidavits; feedstock carbon via TOC sampling
  (ISO 20236:2024). 5-year record retention.

## 5. End use and storage

- Eligible: soil (FAO agricultural soils, forestry soils, amenity land),
  low-oxygen burial (not available outside US/CA/UK/EU), built environment.
- Soil exclusions: net crop-yield decrease; frozen/waterlogged/snow-covered
  ground; erosion-prone slopes; within 10 m of watercourses and 50 m of
  springs/wells/boreholes.
- Particle size: ≥95% by weight through a 10 mm sieve, or >20 mm material
  fully incorporated immediately on application.
- Stockpiling: ≤12 months post-production (G-6VWJ-0); wet or compost-mixed
  against self-ignition; covered storage away from waterways.
- Application evidence: geo-tagged visual documentation, boundary mapping,
  moisture at application; pre-application soil baseline (pH per ISO 10390,
  moisture, bulk density, texture, nutrients, SOC, plus 3 years of prior
  crop-yield/profitability data); ongoing site-management reporting.
- Selling biochar vs credits: third-party sales allowed with affidavits,
  sales documentation, mixing evidence, chain of custody maintained until
  delivery to the final user; one Project Proponent must contractually own
  all credits across the supply chain. Credits issue only after durable
  storage, i.e. post-application, not at plant gate.

## 6. Verification and issuance

- Evidence package: PDD (reactor design, monitoring plan with elements,
  frequency, equipment, accuracy, calibration), monitoring data,
  measurements, emission factors, GHG Statement with uncertainty and
  sensitivity analysis, all through Certify. Quantification data becomes
  public on the registry at issuance.
- VVBs accredited per ISO 14065 family, working to ISO 14064-2/-3; site
  visit required at first validation; verification annual or more frequent;
  Isometric markets monthly issuance with verification within a month of
  data submission.
- Ex-post only: Isometric does not issue ex-ante credits.
- Buffer: soil-storage biochar is typically deemed No Observable Risk of
  reversal → 0% buffer contribution. Full risk-score table is in Standard
  Appendix C (not verified publicly; confirm).
- Governance: disclosure of other-registry participation within 5 years
  (R-Q3JN-0); financial additionality via 10-year IRR analysis (G-NTMA-0);
  separation of duties between production staff and data review/reporting
  (R-GGVF-0). Distributed projects: ≥20% of gross credit revenue to enrolled
  participants per reporting period (R-1J8Y-0).

## 7. Digital MRV requirements (a spec for our platform)

R-8W08-0: the dMRV system must (1) log data offline with tamper-proof
timestamps, (2) automatically flag data anomalies, (3) upload locally stored
data within 30 days, (4) have offline encrypted storage. Distributed module
§4 adds: secure cloud platform, time-stamping on transmission, raw-data
access restricted to Proponent + VVBs + Isometric, automatic anomaly flags
for out-of-range sensor readings and incomplete batch records.

## Positioning vs Puro (as Isometric states it)

200-year minimum durability (vs the incumbent 100-year H/Corg model),
a stricter H-to-C threshold, the only 1,000-year biochar option
(inertinite, Sanei et al. 2024), durable-fraction crediting capped at 0.95
with 17th-percentile conservatism, strictly ex-post issuance.
(https://isometric.com/pathways/biochar)

## Open questions for Isometric

1. v1.3 certification date and changelog detail.
2. Classification of feedstocks the module does not name (residue vs purpose-grown).
3. Buffer-pool percentage table (Standard Appendix C).
4. GHG Accounting + Energy Use module internals (emission factors, grid
   electricity treatment).
5. Exact algebraic form of the 200-yr Woolf equation (verify before
   implementing).
6. Built Environment module version and requirements.
