import { table } from 'tentjs'

export const usage = table('usage', { shows: 'counts', access: { read: 'owner' } })
