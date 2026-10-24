import { project } from 'tentjs'

export const whoIsAround = project('whoIsAround', {
  title: 'Who is here now, kept in memory',
  backups: { every: false },
})
