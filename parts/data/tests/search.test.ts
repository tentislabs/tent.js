import assert from 'node:assert/strict'
import { test } from 'node:test'
import { project, table, text } from '../../core/index.ts'
import type { Row, Searcher } from '../index.ts'
import { connected, layoutOf } from '../index.ts'
import { at, described, reading, seal, seedShop, shopStore, user, writing } from './shop.ts'
import { system } from './work.ts'

const articles = table('articles', {
  columns: { title: text(), body: text({ optional: true }) },
  search: { columns: ['title', 'body'], by: 'pieces' },
})
const notes = table('notes', { columns: { body: text(), more: text({ optional: true }) }, search: ['body', 'more'] })
const library = described([project('library', {}), articles, notes])

const texts = [
  'an international agreement',
  'çalışkanlığı ile bilinir',
  'İstanbul Boğazı',
  'kısım bir',
  'kisim iki',
  'büyük şok dalgası',
  'say "big" OR small*',
  'big small',
  'ISI yalıtımı',
  '東京都渋谷区の天気は晴れです',
  'Über alles',
]

test('[20-2] [night] a search finds by pieces, by the start of a word, by words in either order, and what was typed is always text', (t) => {
  const store = shopStore(t, library)
  writing(
    store,
    library,
    system,
  )((db) => {
    for (const body of texts) {
      at(db, 'articles').add({ title: `title ${texts.indexOf(body)}`, body })
      at(db, 'notes').add({ body })
    }
    // Words that stand in two columns of one row.
    at(db, 'articles').add({ title: 'quarterly report', body: 'the figures of the north' })
    at(db, 'notes').add({ body: 'quarterly report', more: 'the figures of the north' })
  })
  const db = reading(store, library, system)
  const found = (tableName: string, typed: string) =>
    at(db, tableName)
      .search(typed)
      .all()
      .map((row) => (String(row.body).startsWith('the figures') || row.more ? 'report' : row.body))
  const byPieces = (typed: string) => found('articles', typed)
  const finds = (typed: string) => found('notes', typed)

  // By pieces: three letters from the middle of a word, in Turkish and in a script with no spaces too.
  assert.deepEqual(byPieces('nat'), ['an international agreement'])
  assert.deepEqual(byPieces('ışk'), ['çalışkanlığı ile bilinir'])
  assert.deepEqual(byPieces('lığ'), ['çalışkanlığı ile bilinir'])
  assert.deepEqual(byPieces('渋谷区'), ['東京都渋谷区の天気は晴れです'])
  // A small dotless i finds no dotted i, and a dotted i no dotless one.
  assert.deepEqual(byPieces('kıs'), ['kısım bir'])
  assert.deepEqual(byPieces('kis'), ['kisim iki'])
  assert.deepEqual(finds('kısım'), ['kısım bir'])
  assert.deepEqual(finds('kisim'), ['kisim iki'])
  // Capitals do not count, and a letter with a mark is the letter without it: `istanbul` finds `İstanbul`.
  assert.deepEqual(byPieces('istanbul'), ['İstanbul Boğazı'])
  assert.deepEqual(byPieces('ISTANBUL'), ['İstanbul Boğazı'])
  assert.deepEqual(finds('istanbul'), ['İstanbul Boğazı'])
  assert.deepEqual(finds('bogazı'), ['İstanbul Boğazı'])
  assert.deepEqual(finds('bogazi'), [], 'the dotless i at its end stays a letter of its own')
  assert.deepEqual(byPieces('uber'), ['Über alles'])
  // The capital `I` is the dotted `i` to the index: a word in capitals is found by `i` in that place, and not by `ı`.
  assert.deepEqual(finds('isi'), ['ISI yalıtımı'])
  assert.deepEqual(finds('ısı'), [])
  // `s` finds `ş`, in both ways.
  assert.deepEqual(byPieces('sok'), ['büyük şok dalgası'])
  assert.deepEqual(finds('sok'), ['büyük şok dalgası'])
  // Found the best first: of the rows that a start of one character finds, the order is the index's own.
  assert.deepEqual(byPieces('s').sort(), ['big small', 'büyük şok dalgası', 'say "big" OR small*'])

  // One or two typed characters find a row by the start of a word, also in the middle of its text, and by no
  // letters from the inside of a word.
  assert.deepEqual(byPieces('i').sort(), [
    'ISI yalıtımı',
    'an international agreement',
    'kisim iki',
    'çalışkanlığı ile bilinir',
    'İstanbul Boğazı',
  ])
  assert.deepEqual(byPieces('ag'), ['an international agreement'])
  assert.deepEqual(byPieces('gr'), [])
  assert.deepEqual(byPieces('ü'), ['Über alles'])
  assert.deepEqual(byPieces('東'), ['東京都渋谷区の天気は晴れです'])
  assert.deepEqual(byPieces('京'), [], 'in a script with no spaces a text is found by its start alone')

  // Several typed words find the row that holds each of them, in either order and in any searched column.
  for (const typed of ['agreement international', 'international agreement', 'nation agree an'])
    assert.deepEqual(byPieces(typed), ['an international agreement'], typed)
  for (const typed of ['agreement international', 'international agreement'])
    assert.deepEqual(finds(typed), ['an international agreement'], typed)
  assert.deepEqual(byPieces('international treaty'), [])
  assert.deepEqual(finds('international treaty'), [])
  assert.deepEqual(byPieces('north quarterly'), ['report'])
  assert.deepEqual(finds('north quarterly'), ['report'])
  // By words a word is found whole, and by no part of it.
  assert.deepEqual(finds('inter'), [])
  assert.deepEqual(finds('agreement'), ['an international agreement'])

  // A double quote, a star and the word `OR` are looked for as text.
  assert.deepEqual(finds('"big" OR small*'), ['say "big" OR small*'])
  assert.deepEqual(finds('big OR small'), ['say "big" OR small*'])
  assert.deepEqual(finds('sma*'), [])
  assert.deepEqual(finds('big NOT small'), [])
  assert.deepEqual(byPieces('"big" OR small*'), ['say "big" OR small*'])
  assert.deepEqual(byPieces('"big"'), ['say "big" OR small*'])
  assert.deepEqual(byPieces('small*'), ['say "big" OR small*'])
  assert.deepEqual(byPieces('big AND small'), [])
  // By words a sign that is neither a letter nor a digit parts words, and a typed word of signs alone is left out.
  assert.deepEqual(finds('big-small'), ['big small'])
  assert.deepEqual(finds('*** agreement'), ['an international agreement'])

  // A search for empty text, or for white space alone, is no part of the plan: every row fits.
  assert.equal(byPieces('').length, 12)
  assert.equal(finds('  \t ').length, 12)
  // It joins with a filter, a sort and a limit like any part of a plan, and the sort it states orders the rows.
  assert.deepEqual(
    at(db, 'articles')
      .search('i')
      .where({ title: { not: 'title 2' } })
      .sort('title')
      .limit(2)
      .all()
      .map((row) => row.body),
    ['an international agreement', 'çalışkanlığı ile bilinir'],
  )
  assert.equal(at(db, 'articles').search('i').count(), 5)

  // The index is kept in step: a changed row is found by its new text and no longer by its old, and a removed row by none.
  const row = at(db, 'articles').search('agreement').first()
  writing(
    store,
    library,
    system,
  )((write) => at(write, 'articles').change(String(row?.id), { body: 'a national treaty' }))
  assert.deepEqual(byPieces('agreement'), [])
  assert.deepEqual(byPieces('treaty'), ['a national treaty'])
  assert.deepEqual(byPieces('tr'), ['a national treaty'])
  writing(store, library, system)((write) => at(write, 'articles').remove(String(row?.id)))
  assert.deepEqual(byPieces('treaty'), [])
  assert.deepEqual(byPieces('tr'), [])
})

/** A searcher of a test: it keeps the texts it is told, finds a row by a part of its text, and keeps what it was asked. */
function testSearcher(holds: string[] = []) {
  const kept = new Map<string, Map<string, Record<string, string>>>()
  const told: [string, string, Record<string, string> | undefined][] = []
  const asked: [string, string, number][] = []
  const searcher: Searcher = {
    has: (tableName) => holds.includes(tableName),
    wrote(tableName, id, found) {
      told.push([tableName, id, found])
      if (!kept.has(tableName)) kept.set(tableName, new Map())
      if (found) kept.get(tableName)?.set(id, found)
      else kept.get(tableName)?.delete(id)
    },
    find(tableName, typed, limit) {
      asked.push([tableName, typed, limit])
      // The newest row first, so that its order is not the order of the store.
      return [...(kept.get(tableName) ?? [])]
        .filter(([, found]) => Object.values(found).some((one) => one.includes(typed)))
        .map(([id]) => id)
        .reverse()
        .slice(0, limit)
    },
  }
  return { searcher, told, asked }
}

test('[20-2] [night] a searcher that is handed in is told each committed row, handed what it does not hold, and asked under the rules', (t) => {
  const description = described()
  const plain = shopStore(t, description)
  const s = seedShop(plain, description)
  const layout = layoutOf(description)

  // When it is connected it is asked which tables it holds, and is handed every row of a searched table it does not.
  const { searcher, told, asked } = testSearcher(['products'])
  const store = connected(plain, layout, { searcher })
  assert.deepEqual(told, [
    ['customers', s.acme, { name: 'Acme' }],
    ['customers', s.bolt, { name: 'Bolt' }],
  ])
  told.length = 0

  // It is told each written row once its write is committed, and nothing inside the write.
  const write = writing(store, description, system, { seal, searcher })
  const ids = write((db) => {
    const cog = String(at(db, 'customers').add({ name: 'Cog and Acme', team: s.south }).id)
    at(db, 'customers').change(s.acme, { name: 'Acme Works' })
    at(db, 'customers').change(s.bolt, { vip: true })
    at(db, 'teams').add({ name: 'East' })
    assert.deepEqual(told, [], 'nothing before the write is committed')
    return { cog, nut: String(at(db, 'products').add({ name: 'Wing nut', code: 'N-2', price: 1 }).id) }
  })
  assert.deepEqual(told, [
    ['customers', ids.cog, { name: 'Cog and Acme' }],
    ['customers', s.acme, { name: 'Acme Works' }],
    ['customers', s.bolt, { name: 'Bolt' }],
    ['products', ids.nut, { name: 'Wing nut' }],
  ])
  told.length = 0
  // Nothing of a write that was undone.
  assert.throws(() =>
    write((db) => {
      at(db, 'customers').add({ name: 'Never', team: s.south })
      throw new Error('undone')
    }),
  )
  assert.deepEqual(told, [])
  // A removed row is told with no texts.
  const gone = write((db) => String(at(db, 'customers').add({ name: 'Gone', team: s.north }).id))
  write((db) => at(db, 'customers').remove(gone))
  assert.deepEqual(told.at(-1), ['customers', gone, undefined])

  // A search asks it for as many ids as the limit, and for twice as many again while too few of them pass the rule
  // and it has more. A row that the caller may not read is not answered, and rows come in the order it names.
  write((db) => {
    for (let i = 0; i < 6; i++) at(db, 'customers').add({ name: `South Acme ${i}`, team: s.south })
    at(db, 'customers').add({ name: 'North Acme', team: s.north })
  })
  asked.length = 0
  const ada = reading(store, description, user(s.ada, ['staff']), { seal, searcher })
  const rows: Row[] = at(ada, 'customers').search('Acme').limit(2).all()
  assert.deepEqual(
    rows.map((row) => row.name),
    ['North Acme', 'Acme Works'],
  )
  assert.deepEqual(asked, [
    ['customers', 'Acme', 2],
    ['customers', 'Acme', 4],
    ['customers', 'Acme', 8],
    ['customers', 'Acme', 16],
  ])
  // Where it has no more, it is not asked again.
  asked.length = 0
  assert.deepEqual(
    at(ada, 'customers')
      .search('Works')
      .limit(5)
      .all()
      .map((row) => row.name),
    ['Acme Works'],
  )
  assert.deepEqual(asked, [['customers', 'Works', 5]])
  assert.deepEqual(
    at(reading(store, description, user(s.cy), { seal, searcher }), 'customers')
      .search('Acme')
      .limit(3)
      .all(),
    [],
  )
})
