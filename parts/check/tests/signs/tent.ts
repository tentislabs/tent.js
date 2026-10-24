import { project, text } from 'tentjs'

export const shop = project('shop', { title: 'Shop', settings: { shopName: { type: text({ default: 'Shop' }) } } })
