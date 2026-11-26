# Roadmap

What OpenChar does today is in the [README](../README.md). This page lists the
features planned next, in the order biochar producers preparing for their
first verification need them. When a feature is released it moves to the
[changelog](../CHANGELOG.md), together with the automated tests that prove it
works.

## Records and evidence

- A calibration register for every instrument (scales, thermocouples,
  moisture meters), with due dates and an alert before a calibration lapses.
- Detection of duplicate records, such as one slip entered twice.

## Production and accounting

- Road distance for each consignment, calculated from the supplier's and the
  plant's coordinates, with feedstock collection and biochar delivery
  distances kept separate.
- Diesel and other fuels per batch and per vehicle trip, including reactor
  start-up fuel, and electricity from a meter feed.
- Emissions tagged by Scope 1, 2 and 3, with a dashboard by source, batch and
  month.
- A full mass and carbon balance across biochar, liquids and gas, with a
  check that the outputs add up to the inputs.
- Bio-liquid tanks and drums tracked with the same QR units and custody chain
  as biochar.
- Trends across batches and months: biochar yield, throughput per day and per
  shift, reactor residence time, and energy use.
- Batch and monthly reports as PDF and Excel.

## End use and carbon sinks

- A soil-application mode in the field app for buyers and farmers: GPS
  position and photos where the biochar is spread, short videos, a signed
  declaration, and field boundaries recorded by walking around the field or
  drawing on a map.
- A register of carbon sinks by type (soil, concrete, filtration and other
  uses), each with its own accounting under the registry's rules.
- Storage locations, with stock per location, transfers between locations,
  periodic stock counts, returned deliveries and planned deliveries.

## Registries and credits

- A credit inventory by vintage (the year of the removal) and status
  (issued, sold under contract, or retired), with retirement records and
  verification status read from the registry.
- A Puro.earth connector on the same registry-neutral data model.
- Monitoring report and project design document drafts generated from the
  records.

## Integrations

- Direct connections to plant controllers (PLCs) and SCADA monitoring
  systems over the OPC-UA and Modbus industrial protocols, and batches that
  open and close automatically from reactor start and stop signals.
- Email and WhatsApp alerts for quality limits and missing data.
- Reading weighbridge slips, invoices and electricity bills from photos and
  PDFs, with every extracted value linked to the page it came from and
  mismatches flagged for a person to check.
- CSV and Excel import and export for every table.
- Exports for accounting software such as Tally and Zoho Books.
- A published API reference.

## Accounts

- Field-only and operator roles.
- Two-factor sign-in with an authenticator app.

## Not planned

- ISO 27001 or SOC 2 certification. Those certify an organisation's
  operations, not a codebase. The controls built into the software are in
  [security.md](security.md).
