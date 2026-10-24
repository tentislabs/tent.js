import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Description } from '../../core/internal.ts'
import type { Policy } from '../policy.ts'
import { needsOf } from '../policy.ts'

/** A description of a project that holds the models it is handed, each placed in `functions/models.ts`. */
const holding = (models: Record<string, object>): Description =>
  Object({
    app: { name: 'notes' },
    project: {},
    models,
    places: Object.fromEntries(Object.keys(models).map((name) => [name, { file: 'functions/models.ts' }])),
  })

const policy: Policy = {
  read: ['*'],
  edit: ['*'],
  create: ['*'],
  remove: [],
  tools: ['write'],
  ask: [],
  reaches: ['api.example.com'],
  also: [],
  mode: 'build',
}

test('[05-16.3] a model that names its provider reaches the address of the provider, which reaches holds', () => {
  const after = holding({ writer: { provider: 'anthropic', name: 'claude-sonnet-5-5' } })
  const needs = needsOf(policy, holding({}), after, [{ path: 'functions/models.ts', removed: false }])
  assert.equal(needs.refused, 'reaches api.anthropic.com from writer')
})
