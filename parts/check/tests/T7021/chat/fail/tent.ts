import { project } from 'tentjs'

export const shop = project('shop', {
  title: 'Shop',
  unlock: { scripts: ['https://widgets.example.com'], frames: ['https://maps.example.com'] },
})
