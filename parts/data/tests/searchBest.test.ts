import assert from 'node:assert/strict'
import { test } from 'node:test'
import { project, table, text } from '../../core/index.ts'
import { at, described, reading, shopStore, writing } from './shop.ts'
import { system } from './work.ts'

const byWords = table('pages', {
  columns: { title: text(), body: text() },
  search: { columns: ['title', 'body'], by: 'words' },
})
const byPieces = table('cuts', {
  columns: { title: text(), body: text() },
  search: { columns: ['title', 'body'], by: 'pieces' },
})
const site = described([project('site', {}), byWords, byPieces])

// A long page that names the word once, written first, and a short one about nothing else, written after it.
const long = { title: 'Animals of the south', body: `${'other words of the page '.repeat(120)}quokka` }
const short = { title: 'Quokka quokka quokka', body: 'quokka quokka' }

test('[20-2] a search answers the best rows first, and not in the order they were written, by words and by pieces', (t) => {
  const store = shopStore(t, site)
  writing(
    store,
    site,
    system,
  )((db) => {
    for (const name of ['pages', 'cuts']) {
      at(db, name).add(long)
      at(db, name).add({ title: 'Nothing of it', body: 'a page of other words' })
      at(db, name).add(short)
    }
  })
  const db = reading(store, site, system)
  for (const name of ['pages', 'cuts']) {
    const titles = (plan: { all(): { title?: unknown }[] }) => plan.all().map((row) => row.title)
    assert.deepEqual(titles(at(db, name).search('quokka')), [short.title, long.title], name)
    // A limit keeps the best, and a sort that the plan states still wins.
    assert.deepEqual(titles(at(db, name).search('quokka').limit(1)), [short.title], name)
    assert.deepEqual(titles(at(db, name).search('quokka').sort('title')), [long.title, short.title], name)
  }
})
