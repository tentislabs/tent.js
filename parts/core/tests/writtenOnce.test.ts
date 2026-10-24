import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Description } from '../internal.ts'
import { versionIdOf, write, written } from '../internal.ts'

// The description is written once by a build, with the runtime's own writer of JSON over a copy in the order of the
// format: the text is the same, whatever a key or a value holds, and the engine that reads it back writes it not again.

/** A value with what the writer must hold to: keys that are numbers, lone surrogates, a large number, what holds nothing. */
const tricky = {
  b: [1, undefined, () => 1, { '10': 'ten', '9': 'nine', a: 'a', B: 'B' }],
  a: { '': 'empty', '\udfff1': 'a lone surrogate', '1': '\udfff', '01': 'zero one', '4294967295': 'past an index' },
  big: 12345678901234567890n,
  none: undefined,
  fn: () => 1,
  empty: {},
  list: [],
  quoted: '"\udfff" and \\"\udfff',
  date: new Date(0),
}

test('[13-6] the description is written with the keys of every map in code-unit order, a key that is a number among them, two spaces of indent and one line feed, and its fingerprint over the same content with no spaces, whatever a text holds', () => {
  assert.equal(
    written(tricky, undefined),
    '{"a":{"":"empty","01":"zero one","1":"\\udfff","4294967295":"past an index","\\udfff1":"a lone surrogate"},"b":[1,null,null,{"10":"ten","9":"nine","B":"B","a":"a"}],"big":"12345678901234567890n","date":{},"empty":{},"fn":null,"list":[],"quoted":"\\"\\udfff\\" and \\\\\\"\\udfff"}',
  )
  assert.equal(
    written(tricky, '  '),
    [
      '{',
      '  "a": {',
      '    "": "empty",',
      '    "01": "zero one",',
      '    "1": "\\udfff",',
      '    "4294967295": "past an index",',
      '    "\\udfff1": "a lone surrogate"',
      '  },',
      '  "b": [',
      '    1,',
      '    null,',
      '    null,',
      '    {',
      '      "10": "ten",',
      '      "9": "nine",',
      '      "B": "B",',
      '      "a": "a"',
      '    }',
      '  ],',
      '  "big": "12345678901234567890n",',
      '  "date": {},',
      '  "empty": {},',
      '  "fn": null,',
      '  "list": [],',
      '  "quoted": "\\"\\udfff\\" and \\\\\\"\\udfff"',
      '}',
    ].join('\n'),
  )
  assert.equal(written(undefined, undefined), 'null')
  assert.equal(written('text', '  '), '"text"')
  const description = { app: { name: 'shop', needsEngine: '1.0' }, format: 'tent.description/1', tables: tricky }
  const once = write(Object(description))
  assert.equal(once.text, `${written(description, '  ')}\n`)
  assert.equal(once.versionId, once.fingerprint.slice(0, 32))
})

test('[13-6] the version id of a description that this program wrote is taken from its writing, and that of any other text from its content', () => {
  const description: Description = Object({
    app: { name: 'shop', needsEngine: '1.0' },
    format: 'tent.description/1',
    tables: { '10': { columns: {} }, '9': { columns: {} } },
  })
  const once = write(description)
  const read: Description = JSON.parse(once.text)
  const other = JSON.stringify(read, null, 4)
  // A text that this program wrote is known by its text: nothing is written again to know its id.
  const stringify = JSON.stringify
  let writings = 0
  Reflect.set(JSON, 'stringify', (...given: Parameters<typeof JSON.stringify>) => {
    writings++
    return Reflect.apply(stringify, JSON, given)
  })
  try {
    assert.equal(versionIdOf(once.text, read), once.versionId)
    assert.equal(writings, 0)
    // A text of the same content in another layout is no writing of this program: its id is that of its content.
    assert.equal(versionIdOf(other, JSON.parse(other)), once.versionId)
    assert.ok(writings > 0)
  } finally {
    Reflect.set(JSON, 'stringify', stringify)
  }
})
