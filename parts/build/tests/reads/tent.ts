import { choice, project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  currency: 'USD',
  state: { mode: { type: choice(['auto', 'light', 'dark'], { default: 'auto' }), in: 'device' } },
})
