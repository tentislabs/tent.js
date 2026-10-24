import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  privateHosts: ['http://127.0.0.1'],
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
