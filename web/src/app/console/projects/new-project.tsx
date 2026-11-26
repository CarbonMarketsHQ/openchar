'use client'

import { FormDialog } from '../form-dialog'
import { session } from '@/lib/client'

export function NewProject() {
  return (
    <FormDialog
      trigger="New project"
      triggerTestId="new-project"
      title="Create a project"
      description="A project is one certification effort: a protocol, a geography, its facilities and records."
      path="/projects"
      submitTestId="project-save"
      fields={[
        { name: 'name', label: 'Project name', required: true, testId: 'project-name' },
        { name: 'district', label: 'District or county, region', required: true, placeholder: 'Nakuru County, Kenya', testId: 'project-district' },
        {
          name: 'tSoilC',
          label: 'Average annual soil temperature at storage sites (°C)',
          type: 'number',
          step: '0.1',
          min: '0',
          max: '45',
          required: true,
          hint: 'Drives the 200-year durability factor. From site measurement or a global database.',
          testId: 'project-tsoil',
        },
        {
          name: 'tSoilSource',
          label: 'Soil temperature source',
          required: true,
          placeholder: 'Lembrechts et al. 2022 global database, <district>',
          testId: 'project-tsoil-source',
        },
        {
          name: 'gridEfKg',
          label: 'Grid electricity emission factor (kg CO2e per kWh)',
          type: 'number',
          step: '0.001',
          min: '0',
          max: '2',
          hint: 'Your national or regional grid factor, used for plant electricity. You can add it later.',
          testId: 'project-grid-ef',
        },
        {
          name: 'gridEfSource',
          label: 'Grid factor source',
          placeholder: 'National grid authority, year',
          testId: 'project-grid-source',
        },
        {
          name: 'synthetic',
          label: 'Data basis',
          type: 'select',
          options: [
            { value: 'false', label: 'Production data' },
            { value: 'true', label: 'Synthetic data (pilot or demonstration)' },
          ],
          defaultValue: 'false',
          hint: 'Synthetic projects carry a visible badge on every screen.',
          testId: 'project-synthetic',
        },
      ]}
      transform={(v) => ({
        name: v.name,
        district: v.district,
        tSoilC: Number(v.tSoilC),
        tSoilSource: v.tSoilSource,
        gridEfTPerKwh: v.gridEfKg ? Number(v.gridEfKg) / 1000 : null,
        gridEfSource: v.gridEfSource || null,
        synthetic: v.synthetic === 'true',
      })}
      onDone={(data) => {
        const id = (data as { id?: string } | null)?.id
        if (id) void session({ action: 'select-project', projectId: id })
      }}
    />
  )
}

/** The grid factor differs most from country to country, so each project
 * carries its own, with its source. */
export function EditGridFactor({ projectId, kgPerKwh, source }: { projectId: string; kgPerKwh: number | null; source: string | null }) {
  return (
    <FormDialog
      trigger={kgPerKwh === null ? 'Set grid factor' : 'Edit grid factor'}
      triggerVariant="outline"
      triggerTestId="edit-grid-ef"
      title="Grid electricity emission factor"
      description="Used to turn the plant's electricity use into emissions in every batch's calculation."
      path={`/projects/${projectId}`}
      method="PATCH"
      fields={[
        {
          name: 'gridEfKg',
          label: 'kg CO2e per kWh',
          type: 'number',
          step: '0.001',
          min: '0',
          max: '2',
          required: true,
          defaultValue: kgPerKwh === null ? '' : String(kgPerKwh),
          testId: 'grid-ef-value',
        },
        { name: 'gridEfSource', label: 'Source', required: true, defaultValue: source ?? '', placeholder: 'National grid authority, year', testId: 'grid-ef-source' },
      ]}
      transform={(v) => ({ gridEfTPerKwh: Number(v.gridEfKg) / 1000, gridEfSource: v.gridEfSource })}
      submitLabel="Save"
      submitTestId="grid-ef-save"
    />
  )
}
