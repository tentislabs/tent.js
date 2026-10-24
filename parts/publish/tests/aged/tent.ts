import { project } from 'tentjs'

export const aged = project('aged', {
  title: 'An app that keeps rows for a time',
  // A small page, so that the removal of the old rows takes several writes.
  limits: { workPage: 10 },
  backups: { every: false },
})
