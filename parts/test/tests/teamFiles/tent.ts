import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  backups: { every: false },
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
