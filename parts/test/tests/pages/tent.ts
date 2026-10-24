import { choice, project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  currency: 'USD',
  hosts: ['https://img.example.com'],
  unlock: { scripts: ['https://js.example.com'], camera: true },
  state: { mode: { type: choice(['auto', 'light', 'dark'], { default: 'auto' }), in: 'device' } },
})
