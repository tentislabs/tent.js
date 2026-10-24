import assert from 'node:assert/strict'
import { test } from 'node:test'
import { definitionName, definitionOf } from '../service/definitions.ts'

// The name comes from the description of a bundle, which another may have written.
const name = '../../tmp/x\nshop'
const defined = { name, user: 'shop', home: '/home/shop/.tent', words: ['start', '/srv/shop'], machine: false }

test('[41-13a] tent service names the file of a definition by a name that holds no folder of its own', () => {
  const named = definitionName(name)
  assert.doesNotMatch(named, /[/\\.\n]/, named)
  assert.match(definitionOf('darwin', defined), new RegExp(`<string>com\\.tentjs\\.${named}</string>`))
})

test('[41-13a] tent service writes the name of an app into a launchd file and a task on one line', () => {
  for (const system of ['darwin', 'win32'] as const) {
    const lines = definitionOf(system, defined).split('\n')
    assert.equal(
      lines.some((line) => line.trim() === 'shop' || line.startsWith('shop')),
      false,
      lines.join('\n'),
    )
  }
})
