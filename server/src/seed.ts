/**
 * Seed: a fictional demo producer, Nyota Biochar, onboarded the way a real
 * one would be. Workspace and user creation run through the production
 * auth code path. Everything else is synthetic: three hot-trial batches of
 * maize-cob biochar, crop residue that would otherwise decay, hopper and
 * silo scales checked against weighbridge slips, one lab certificate in and
 * one pending, wood-vinegar co-products, an activation trial that earns no
 * credits, and an offline aggregation point that syncs at the plant.
 */
import { createWorkspaceWithAdmin } from './auth.js'
import { appendEvents, migrate, pool } from './db.js'

const DAY = 86400000
const iso = (daysAgo: number, minutes = 0) =>
  new Date(Date.now() - daysAgo * DAY + minutes * 60000).toISOString()

const DEMO = {
  workspaceId: 'ws-demo',
  projectId: 'prj-demo',
  facilityId: 'fac-demo-1',
  email: 'demo@openchar.example',
  password: process.env.SEED_DEMO_PASSWORD || 'charcoal-demo-2026',
}

async function seed() {
  await migrate()
  // Seeding truncates every tenant, so it only runs on an empty database
  // unless the operator says this one is disposable. Exit 3 = refused.
  const { rows: existing } = await pool.query(`SELECT count(*)::int AS n FROM workspaces`)
  if (existing[0].n > 0 && process.env.SEED_FORCE !== '1') {
    console.error(
      `refusing to seed: this database already holds ${existing[0].n} workspace(s) and seeding erases all of them. ` +
        'Set SEED_FORCE=1 only on a disposable database.'
    )
    await pool.end()
    process.exit(3)
  }
  await pool.query(`
    TRUNCATE certify_submissions, applications, dispatches, batch_ops, certificates,
      samples, co_products, telemetry, batches, lots, consignments, field_events,
      suppliers, sources, facilities, projects, sessions, users, workspaces CASCADE
  `)

  // Tenants, through the real auth path.
  await createWorkspaceWithAdmin({
    workspaceName: 'Nyota Biochar (demo)',
    name: 'Plant Operations',
    email: DEMO.email,
    password: DEMO.password,
    workspaceId: DEMO.workspaceId,
    userId: 'usr-demo-ops',
  })

  await pool.query(
    `INSERT INTO projects (id, workspace_id, name, district, synthetic, public, t_soil_c, t_soil_source, grid_ef_t_per_kwh, grid_ef_source) VALUES
     ($1, $2, 'Nyota Crop-Residue Biochar', 'Nakuru County, Kenya', true, true, 21.5,
      'Lembrechts et al. 2022 global soil temperature database, Nakuru County, to be replaced with a site measurement',
      0.000716, 'illustrative value for the demo (0.716 kg CO2e per kWh), to be replaced with the national grid factor')`,
    [DEMO.projectId, DEMO.workspaceId]
  )

  await pool.query(
    `INSERT INTO facilities (id, project_id, name, gps_lat, gps_lng, reactor_make, reactor_type, nameplate_tpd, scales_note, lab_partner) VALUES
     ($1, $2, 'Nyota Plant 1', -0.30, 36.08, 'Demo kiln works', 'continuous-feed pyrolysis', 10,
      'No on-site weighbridge. Loading-hopper and silo scales in use, with slips from the nearby weighbridge photographed at the gate.',
      'ISO/IEC 17025 accredited laboratory (demo)')`,
    [DEMO.facilityId, DEMO.projectId]
  )

  await pool.query(
    `INSERT INTO sources (id, project_id, kind, title, ref, note) VALUES
     ('src-slip-001', $1, 'weighbridge-slip', 'Weighbridge slip 4411 (demo)', 'slips/4411.jpg', 'Nearby legal-for-trade weighbridge, slip photographed at the gate'),
     ('src-hopper-cal', $1, 'calibration', 'Hopper and silo scale calibration record (demo)', 'cal/scales-2026.pdf', 'Calibration certificates for the loading hopper and biochar silo scales'),
     ('src-cert-ht02', $1, 'lab-certificate', 'Trial batch HT-02 lab certificate (demo)', 'lab/HT-02.pdf', 'Ultimate analysis: Corg, H/Corg, O/Corg, moisture'),
     ('src-decay-photos', $1, 'counterfactual', 'Residue heaps photo series, supplier yards (demo)', 'photos/decay-set-1/', 'Maize cobs with no commercial use, left to decay. The basis of the CC3 argument'),
     ('src-telemetry-ht02', $1, 'telemetry-export', 'Reactor temperature export, run HT-02 (demo)', 'telemetry/HT-02.csv', 'PLC export, 1-minute aggregation'),
     ('src-app-photos', $1, 'application-evidence', 'Application day photo set (demo)', 'photos/app-01/', 'Geo-tagged application photos and farmer attestation')`,
    [DEMO.projectId]
  )
  // The scale calibration record belongs to the plant, not to one batch.
  await pool.query(
    `INSERT INTO source_links (source_id, project_id, record_kind, record_id) VALUES ('src-hopper-cal', $1, 'facility', $2)`,
    [DEMO.projectId, DEMO.facilityId]
  )

  await pool.query(
    `INSERT INTO suppliers (id, project_id, name, village, category, lat, lng) VALUES
     ('SUP-1', $1, 'Bahati Farmers Co-op', 'Bahati', 'crop-residue', -0.15, 36.15),
     ('SUP-2', $1, 'Rongai Maize Growers', 'Rongai', 'crop-residue', -0.17, 35.86),
     ('SUP-3', $1, 'Subukia Village Cluster', 'Subukia', 'crop-residue', 0.00, 36.23)`,
    [DEMO.projectId]
  )

  const consignmentSeeds = [
    { id: 'CN-001', supplier: 'SUP-1', est: 380, moisture: 0.24, days: 18, lot: 'L-01' },
    { id: 'CN-002', supplier: 'SUP-2', est: 420, moisture: 0.22, days: 17, lot: 'L-01' },
    { id: 'CN-003', supplier: 'SUP-3', est: 395, moisture: 0.25, days: 15, lot: 'L-02' },
    { id: 'CN-004', supplier: 'SUP-1', est: 440, moisture: 0.21, days: 12, lot: 'L-02' },
    { id: 'CN-005', supplier: 'SUP-2', est: 405, moisture: 0.23, days: 9, lot: 'L-03' },
    { id: 'CN-006', supplier: 'SUP-1', est: 410, moisture: 0.22, days: 1, lot: null },
  ]
  await appendEvents(
    DEMO.projectId,
    consignmentSeeds.map((c) => ({
      id: `EV-${c.id}`,
      kind: 'consignment-captured',
      capturedAt: iso(c.days),
      deviceId: 'field-tab-01',
      payload: {
        consignmentId: c.id,
        supplierId: c.supplier,
        estMassKg: c.est,
        moistureFrac: c.moisture,
        category: 'crop-residue',
        gps: { lat: -0.2, lng: 36.1 },
        photoRef: `photos/${c.id}.jpg`,
      },
    }))
  )

  await pool.query(
    `INSERT INTO lots (id, project_id, hopper_mass_kg, weighbridge_slip_kg, moisture_frac, slip_source_id) VALUES
     ('L-01', $1, 800, 792, 0.23, 'src-slip-001'),
     ('L-02', $1, 835, 828, 0.23, 'src-slip-001'),
     ('L-03', $1, 405, 401, 0.23, 'src-slip-001')`,
    [DEMO.projectId]
  )
  for (const c of consignmentSeeds) {
    await pool.query(
      `INSERT INTO consignments (id, project_id, supplier_id, est_mass_kg, moisture_frac, category, state, photo_ref, gps_lat, gps_lng, captured_at, lot_id)
       VALUES ($1, $2, $3, $4, $5, 'crop-residue', $6, $7, -0.2, 36.1, $8, $9)`,
      [c.id, DEMO.projectId, c.supplier, c.est, c.moisture, c.lot ? 'attached' : 'received', `photos/${c.id}.jpg`, iso(c.days), c.lot]
    )
  }

  await pool.query(
    `INSERT INTO batches (id, project_id, facility_id, code, status, opened_at, closed_at, feedstock_mass_kg, biochar_wet_kg, biochar_moisture_frac, duration_min, gps_lat, gps_lng, notes) VALUES
     ('bat-ht02', $1, $2, 'HT-02', 'sampled', $3, $4, 4800, 1250, 0.18, 180, -0.30, 36.08, 'Hot trial 2: stability check, fully sampled and analysed'),
     ('bat-ht03', $1, $2, 'HT-03', 'awaiting-lab', $5, $6, 4200, 1100, 0.19, 165, -0.30, 36.08, 'Hot trial 3: samples dispatched to the lab'),
     ('bat-ht01', $1, $2, 'HT-01', 'open', $7, NULL, 1900, NULL, NULL, NULL, -0.30, 36.08, 'Continuous-feed shakedown run in progress')`,
    [DEMO.projectId, DEMO.facilityId, iso(20), iso(6), iso(10), iso(3), iso(2)]
  )
  await pool.query(`UPDATE lots SET batch_id = 'bat-ht02' WHERE id IN ('L-01', 'L-02')`)
  await pool.query(`UPDATE lots SET batch_id = 'bat-ht03' WHERE id = 'L-03'`)

  const telemetry: { batch: string; minute: number; temp: number }[] = []
  const profile = (minute: number): number => {
    if (minute <= 30) return 25 + (minute / 30) * 525
    if (minute >= 40 && minute <= 48) return 340 + Math.sin(minute) * 8
    if (minute > 160) return Math.max(80, 550 - (minute - 160) * 24)
    return 552 + Math.sin(minute / 3) * 9
  }
  for (let m = 0; m <= 180; m++) telemetry.push({ batch: 'bat-ht02', minute: m, temp: round1(profile(m)) })
  for (let m = 0; m <= 165; m++) {
    const t = m <= 30 ? 25 + (m / 30) * 520 : m > 150 ? Math.max(80, 545 - (m - 150) * 30) : 548 + Math.sin(m / 4) * 7
    telemetry.push({ batch: 'bat-ht03', minute: m, temp: round1(t) })
  }
  for (let m = 0; m <= 45; m++) telemetry.push({ batch: 'bat-ht01', minute: m, temp: round1(25 + (m / 45) * 480) })
  const values = telemetry.map((t) => `('${t.batch}', ${t.minute}, ${t.temp})`).join(',')
  await pool.query(`INSERT INTO telemetry (batch_id, minute, temp_c) VALUES ${values}`)

  await pool.query(
    `INSERT INTO co_products (id, batch_id, kind, grade, mass_kg, fate) VALUES
     ('CP-1', 'bat-ht02', 'bio-liquid', '1', 220, 'Wood vinegar for agriculture'),
     ('CP-2', 'bat-ht02', 'bio-liquid', '2', 180, 'Wood vinegar for agriculture'),
     ('CP-3', 'bat-ht02', 'bio-liquid', '3', 150, 'Green chemical feedstock'),
     ('CP-7', 'bat-ht02', 'biochar', 'activation-trial', 50, 'Activated carbon development line; excluded from crediting'),
     ('CP-4', 'bat-ht03', 'bio-liquid', '1', 200, 'Wood vinegar for agriculture'),
     ('CP-5', 'bat-ht03', 'bio-liquid', '2', 160, 'Wood vinegar for agriculture'),
     ('CP-6', 'bat-ht03', 'bio-liquid', '3', 140, 'Green chemical feedstock')`
  )

  await pool.query(
    `INSERT INTO samples (id, batch_id, label, taken_at, state, note) VALUES
     ('smp-ht02-1', 'bat-ht02', 'S-HT-02-1', $1, 'analyzed', 'Top of silo discharge, coarse fraction'),
     ('smp-ht02-2', 'bat-ht02', 'S-HT-02-2', $1, 'analyzed', 'Mid-run discharge, representative mix'),
     ('smp-ht02-3', 'bat-ht02', 'S-HT-02-3', $1, 'analyzed', 'End-of-run discharge, fine fraction'),
     ('smp-ht03-1', 'bat-ht03', 'S-HT-03-1', $2, 'at-lab', 'Dispatched to the lab'),
     ('smp-ht03-2', 'bat-ht03', 'S-HT-03-2', $2, 'at-lab', 'Dispatched to the lab'),
     ('smp-ht03-3', 'bat-ht03', 'S-HT-03-3', $2, 'at-lab', 'Dispatched to the lab')`,
    [iso(5), iso(2)]
  )

  await pool.query(
    `INSERT INTO certificates (id, batch_id, lab, corg_frac, h_corg, o_corg, moisture_frac, source_id) VALUES
     ('cert-ht02', 'bat-ht02', 'ISO/IEC 17025 accredited laboratory (demo)', 0.78, 0.42, 0.12, 0.18, 'src-cert-ht02')`
  )

  await pool.query(
    `INSERT INTO batch_ops (batch_id, transport_km, transport_mass_t, electricity_kwh) VALUES
     ('bat-ht02', 85, 1.25, 420),
     ('bat-ht03', 60, 1.10, 380)`
  )

  await pool.query(
    `INSERT INTO dispatches (id, batch_id, to_name, mass_kg, dispatched_at) VALUES
     ('dsp-01', 'bat-ht02', 'Bulk biochar buyer (demo)', 600, $1)`,
    [iso(2)]
  )
  await pool.query(
    `INSERT INTO applications (id, project_id, dispatch_id, farm_name, area_ha, polygon, applied_mass_kg, applied_at, source_id) VALUES
     ('app-01', $1, 'dsp-01', 'Bahati smallholder cluster (demo)', 1.6,
      '{"county":"Nakuru","ward":"Bahati","approx":true}', 600, $2, 'src-app-photos')`,
    [DEMO.projectId, iso(1)]
  )

  const counts = await pool.query(
    `SELECT (SELECT count(*) FROM workspaces) w, (SELECT count(*) FROM users) u,
            (SELECT count(*) FROM suppliers) s, (SELECT count(*) FROM consignments) c,
            (SELECT count(*) FROM batches) b, (SELECT count(*) FROM telemetry) t,
            (SELECT count(*) FROM field_events) e`
  )
  console.log('seeded:', counts.rows[0])
  console.log(`demo login: ${DEMO.email} / ${DEMO.password}`)
  await pool.end()
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
