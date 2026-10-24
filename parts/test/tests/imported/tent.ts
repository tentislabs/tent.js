import { project } from 'tentjs'

export const club = project('club', {
  title: 'A club that imports its members',
  languages: ['en', 'de'],
  backups: { every: false },
})
