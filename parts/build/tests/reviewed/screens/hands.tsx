import { screen } from 'tentjs/ui'
import { STATUSES } from '../shared/constants'

export const importedInOption = screen('importedInOption', {
  path: '/imported',
  access: 'anyone',
  title: STATUSES[0],
  view: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>option</span>
    </div>
  ),
})
