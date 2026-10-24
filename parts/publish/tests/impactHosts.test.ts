import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import { impactOf } from '../index.ts'

/** A description of an app that holds the parts it is handed, and nothing else. */
const holding = (parts: Record<string, object>): Description =>
  Object({
    app: { name: 'shop' },
    project: {},
    tables: {},
    functions: {},
    flows: {},
    screens: {},
    components: {},
    ...parts,
  })

test('[44-2] a new outside host is told for a model of a new provider and for a new entry of hosts, as for a service', () => {
  const live = holding({ services: { pay: { url: 'https://api.pay.example' } } })
  const next = holding({
    project: { hosts: ['files.example.com'] },
    services: { pay: { url: 'https://api.pay.example' } },
    models: { writer: { provider: 'anthropic', name: 'claude-sonnet-5-5' } },
  })
  const told = impactOf({ against: 'live', live, next }).out.map((one) => `${one.name} ${one.change}`)
  assert.deepEqual(told.sort(), [
    'shop a new outside host, files.example.com',
    'writer a new outside host, api.anthropic.com',
  ])
})
