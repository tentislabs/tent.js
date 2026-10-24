import { project } from 'tentjs'

export const vault = project('vault', {
  title: 'A vault with raw SQL over tenant files',
  limits: { openFiles: 50, fileCloseAfter: '1 minute', filesAtOnce: 4 },
  backups: { every: false, keep: 2 },
})
