'use client'

import { FormDialog } from '../form-dialog'

export function NewSupplier() {
  return (
    <FormDialog
      trigger="Add supplier"
      triggerTestId="new-supplier"
      title="Register a supplier"
      description="FPOs, growers' collectives, village clusters and processing units the field app can book consignments against."
      path="/suppliers"
      submitTestId="supplier-save"
      fields={[
        { name: 'name', label: 'Supplier name', required: true, testId: 'supplier-name' },
        { name: 'village', label: 'Village or town', required: true, testId: 'supplier-village' },
        {
          name: 'category',
          label: 'Feedstock category',
          type: 'select',
          required: true,
          options: [
            { value: 'crop-residue', label: 'Crop residue (no commercial use)' },
            { value: 'forestry-residue', label: 'Forestry residue' },
            { value: 'processing-offcut', label: 'Processing-unit offcuts' },
            { value: 'agri-residue', label: 'Other agricultural residue' },
            { value: 'forestry-residue', label: 'Forestry residue' },
          ],
          hint: 'Registries treat residue and purpose-grown feedstock very differently.',
          testId: 'supplier-category',
        },
      ]}
    />
  )
}
