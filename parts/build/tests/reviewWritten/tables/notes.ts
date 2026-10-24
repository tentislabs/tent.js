import { count, link, list, number, role, table, text, vector } from 'tentjs'
import { embedder } from '../models/embedder'

export const users = table('users', {
  columns: { roles: list(text()), placed: number({ from: count({ of: 'orders', by: 'user' }) }) },
  access: { read: 'owner' },
})

export const orders = table('orders', {
  columns: { user: link('users'), total: number() },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: {
    salary: text({ read: role('staff') }),
    code: text({ sealed: { findable: true } }),
    meaning: vector({ size: 3, model: embedder, copy: 'small' }),
  },
  access: { read: 'signedIn' },
})

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
