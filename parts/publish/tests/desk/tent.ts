import { project } from 'tentjs'

export const desk = project('desk', {
  title: 'A desk for each team',
  limits: { openFiles: 50, fileCloseAfter: '1 minute', filesAtOnce: 4 },
  backups: { every: false, keep: 2 },
})
