import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  uploads: 'signedIn',
  api: { origins: ['https://partner.example'], headers: ['X-Partner'] },
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
})
