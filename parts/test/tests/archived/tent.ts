import { project } from 'tentjs'

export const archived = project('archived', {
  title: 'An app whose every change is archived',
  // A part of the archive is cut small, so that an hour of writes makes several.
  limits: { archivePart: '16 KB' },
  backups: { every: false, keep: 8 },
})
