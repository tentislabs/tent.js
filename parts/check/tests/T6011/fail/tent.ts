import { choice, project } from 'tentjs'

export const shop = project('shop', {
  currency: 'USD',
  state: { mode: choice(['light', 'dark'], { default: 'light' }) },
})
