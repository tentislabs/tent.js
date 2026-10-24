import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { chunks, TentError } from '../index.ts'

/** A text that is the same on every run: paragraphs of sentences of words, drawn from a fixed seed. */
function madeText(paragraphs: number, seed: number): string {
  let state = seed
  const next = (below: number) => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % below
  }
  const words = [
    'order',
    'tent',
    'İzmir',
    'değil',
    'sales',
    'a',
    'refund',
    'customer',
    'kept',
    'naïve',
    '日本語',
    'row',
  ]
  const text: string[] = []
  for (let p = 0; p < paragraphs; p++) {
    const sentences: string[] = []
    for (let s = 0; s < 1 + next(6); s++) {
      const said: string[] = []
      for (let w = 0; w < 3 + next(14); w++) said.push(words[next(words.length)])
      sentences.push(`${said.join(' ')}${['.', '?', '!'][next(3)]}`)
    }
    text.push(sentences.join(' '))
  }
  return text.join('\n\n')
}

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)

/** Holds what every chunk must keep to, whatever the text and the options. */
function held(text: string, o: { size?: number; overlap?: number; cut?: 'paragraph' | 'sentence' | 'length' }) {
  const made = chunks(text, o)
  const size = o.size ?? 1200
  let marks = 0
  let seen = 0
  let end = 0
  for (const chunk of made) {
    assert.equal(text.slice(chunk.at, chunk.at + chunk.text.length), chunk.text, 'a chunk is the slice that it names')
    assert.ok(chunk.text.length <= size, `a chunk of ${chunk.text.length} is longer than ${size}`)
    assert.ok(chunk.text.length > 0, 'a chunk holds nothing')
    assert.ok(!chunk.text.includes('\f'), 'a chunk holds a page mark')
    for (; seen < chunk.at; seen++) if (text[seen] === '\f') marks++
    assert.equal(chunk.page, text.includes('\f') ? marks + 1 : undefined, 'the page of a chunk')
    assert.ok(chunk.at + chunk.text.length > end, 'a chunk ends no later than the one before it')
    end = chunk.at + chunk.text.length
  }
  return made
}

test('[22-21] chunks: the same chunks on every system, each the slice it names, none longer than its size or over a page mark, with its page', () => {
  const text = madeText(40, 7)
  const paged = `${madeText(6, 1)}\f${madeText(5, 2)}\f\f${madeText(4, 3)}`

  // The same text and options give the same chunks: the fingerprints are those of the first run, on every system.
  const stored: [string, { size?: number; overlap?: number; cut?: 'paragraph' | 'sentence' | 'length' }, string][] = [
    [text, {}, '6fd3a517630aa660'],
    [text, { size: 300, overlap: 60 }, '1f809d1a22ce2bf9'],
    [text, { size: 200, overlap: 40, cut: 'sentence' }, '2f29b28e17a53ad5'],
    [text, { size: 97, overlap: 20, cut: 'length' }, '57378cd892808395'],
    [paged, { size: 250, overlap: 50 }, '1e3024639f269f1a'],
    [paged, { size: 40, overlap: 10, cut: 'sentence' }, 'e181a1736f22c348'],
  ]
  assert.deepEqual(
    stored.map(([of, o]) => fingerprint(held(of, o))),
    stored.map(([, , print]) => print),
  )
  assert.deepEqual(chunks(text, { size: 300, overlap: 60 }), chunks(text, { size: 300, overlap: 60 }))

  // Chunks by hand: two paragraphs that fit together, and a third that starts the next chunk.
  const three = 'One two.\n\nThree four.\n \t\nFive six seven.'
  assert.deepEqual(chunks(three, { size: 22, overlap: 0 }), [
    { text: 'One two.\n\nThree four.', at: 0 },
    { text: 'Five six seven.', at: 25 },
  ])
  // With an overlap the next chunk starts at the earliest unit within it, where that unit and the next fit.
  assert.deepEqual(chunks('aaaa\n\nbbbb\n\ncccc\n\ndddd', { size: 10, overlap: 4 }), [
    { text: 'aaaa\n\nbbbb', at: 0 },
    { text: 'bbbb\n\ncccc', at: 6 },
    { text: 'cccc\n\ndddd', at: 12 },
  ])
  // A line feed with a carriage return before it ends a line too, and a page mark is in no chunk.
  assert.deepEqual(chunks('One.\r\n\r\nTwo.\fThree.', { size: 6, overlap: 0 }), [
    { text: 'One.', at: 0, page: 1 },
    { text: 'Two.', at: 8, page: 1 },
    { text: 'Three.', at: 13, page: 2 },
  ])
  // A paragraph longer than the size is split into its sentences, and a sentence at its last white space.
  assert.deepEqual(chunks('First one. Second one.', { size: 12, overlap: 0 }), [
    { text: 'First one.', at: 0 },
    { text: 'Second one.', at: 11 },
  ])
  assert.deepEqual(
    chunks('alpha beta gamma', { size: 11, overlap: 0 }).map((chunk) => chunk.text),
    ['alpha beta', 'gamma'],
  )

  // A text with no space and a text of one character each end.
  const noSpace = 'x'.repeat(2500)
  assert.deepEqual(
    held(noSpace, {}).map((chunk) => [chunk.at, chunk.text.length]),
    [
      [0, 1200],
      [1200, 1200],
      [2400, 100],
    ],
  )
  assert.deepEqual(held(noSpace, { size: 1000, overlap: 100, cut: 'length' }).at(-1)?.at, 1800)
  assert.deepEqual(chunks('x'), [{ text: 'x', at: 0 }])
  assert.deepEqual(chunks('x', { cut: 'length' }), [{ text: 'x', at: 0 }])
  assert.deepEqual(chunks(''), [])
  assert.deepEqual(chunks(' \n\n \f '), [])

  // A character that is counted as two is never cut in half.
  for (const chunk of held('\u{1F600}'.repeat(50), { size: 7, overlap: 2, cut: 'length' }))
    assert.equal(chunk.text.length % 2, 0)
  for (const chunk of held('\u{1F600}'.repeat(50), { size: 7, overlap: 0 })) assert.equal(chunk.text.length % 2, 0)

  // An option that is not allowed is refused, and names the option.
  for (const [o, field] of [
    [{ size: 0 }, 'size'],
    [{ size: 100, overlap: 50 }, 'overlap'],
    [{ cut: 'word' }, 'cut'],
    [{ language: 'no language at all' }, 'language'],
    [{ sizes: 3 }, 'sizes'],
  ] as const) {
    assert.throws(
      () => Reflect.apply(chunks, undefined, ['some text', o]),
      (thrown) => thrown instanceof TentError && thrown.code === 'T0002' && thrown.fields?.[field] !== undefined,
      `the option ${field}`,
    )
  }
})
