import { project } from 'tentjs'

export const shop = project('shop', { title: 'Shop', limits: { anyonePerMinute: 5 } })
