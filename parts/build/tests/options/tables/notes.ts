import { count, link, list, number, role, table, text, vector, where } from 'tentjs'
import { embedder } from '../models/writer'

export const users = table('users', { columns: { roles: list(text()) }, access: { read: 'owner' } })

export const teams = table('teams', {
  columns: {
    name: text(),
    notes: number({ from: count({ of: 'notes', by: 'team', where: { body: { startsWith: 'a' } } }) }),
  },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: {
    team: link('teams'),
    body: text(),
    salary: text({ read: role('staff') }),
    code: text({ sealed: { findable: true } }),
    meaning: vector({ size: 3, model: embedder, copy: 'small' }),
  },
  access: { read: 'signedIn', add: 'signedIn' },
})

export const orders = table('orders', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    placedBy: link('users'),
    note: text({ optional: true }),
    total: number(),
  },
  owner: 'placedBy',
  access: { read: where({ placedBy: 'u1' }), add: 'signedIn', change: 'owner', remove: role('staff') },
  search: { columns: ['note'], by: 'pieces' },
  indexes: [['total', 'note']],
  unique: [['note']],
  keepHistory: true,
  removed: ['oldColumn'],
  tenant: 'team',
  plain: true,
  was: ['sales'],
})

export const usage = table('usage', { shows: 'counts', access: { read: 'signedIn' } })

export const visits = table('visits', {
  columns: { page: text() },
  access: { read: 'signedIn' },
  lasts: { for: '30 days', by: 'createdAt', where: { page: { startsWith: '/a' } } },
})

export const here = table('here', {
  columns: { page: text() },
  access: { read: 'signedIn' },
  kept: 'memory',
  lasts: '30 seconds',
})
