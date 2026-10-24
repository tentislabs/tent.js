import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Change } from '../index.ts'
import { fieldChanges } from '../compare/records.ts'
import { mergeValue } from '../merge/values.ts'
import type { FieldApart } from '../merge/values.ts'

const about = { what: 'table', name: 'tasks' }
const rows = (...entries: [string, number][]) => ({ data: entries.map(([id, n]) => ({ id, n })) })

test('[40-2] a list whose entries have names is compared entry by entry, by name, as a merge reads it; one with none as one value', () => {
  const changes: Change[] = []
  fieldChanges(changes, about, rows(['a', 1], ['b', 2]), rows(['a', 1], ['b', 3], ['c', 4]))
  assert.deepEqual(
    changes.map((one) => ('path' in one ? one.path : [])),
    [
      ['data', 'b', 'n'],
      ['data', 'c'],
    ],
  )

  const plain: Change[] = []
  fieldChanges(plain, about, { values: [1, 2] }, { values: [1, 3] })
  assert.deepEqual(
    plain.map((one) => ('path' in one ? one.path : [])),
    [['values']],
  )

  // A merge reads the same list by the same names: where both changed one entry, the clash has the path compare gives.
  const apart: FieldApart[] = []
  mergeValue(rows(['a', 1], ['b', 2]), rows(['a', 1], ['b', 3]), rows(['a', 1], ['b', 4]), apart)
  assert.deepEqual(
    apart.map((one) => one.path),
    [['data', 'b', 'n']],
  )
})
