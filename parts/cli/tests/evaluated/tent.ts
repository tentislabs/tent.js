import { project } from 'tentjs'

export const shop = project('shop', { title: 'Shop', limits: { anyonePerMinute: 100000, callerPerMinute: 100000 } })
