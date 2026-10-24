import type { Finding } from 'tentjs'
import { screen } from 'tentjs/ui'

export const findingsScreen = screen('findingsScreen', {
  path: '/findings',
  access: 'signedIn',
  view: ({ findings }: { findings: Finding[] }) => <span>{findings.length}</span>,
})
