import { action, anyone, change, input, list, number, query, role, text } from 'tentjs'
import { isMainThread } from 'node:worker_threads'
import { cards, notices, users } from './tables.ts'

const open = anyone('the board is open to every visitor')

// Read with values.

export const allCards = query('allCards', { access: open, rows: cards.sort('rank') })

export const cardsAt = query('cardsAt', {
  access: open,
  input: { rank: number() },
  rows: cards.where({ rank: input('rank') }),
})

export const oneCard = query('oneCard', { access: open, input: { card: text() }, rows: cards.get(input('card')) })

export const allNotices = query('allNotices', { access: open, rows: notices.oldest('createdAt') })

export const staffCards = query('staffCards', { access: role('staff'), rows: cards.sort('rank') })

export const myCards = query('myCards', { access: 'signedIn', rows: cards.sort('rank') })

export const quietCards = query('quietCards', { access: open, live: false, rows: cards.sort('rank') })

export const freshCards = query('freshCards', { access: open, refresh: '10 seconds', rows: cards.count() })

export const heavyCards = query('heavyCards', { access: open, heavy: true, rows: cards.sort('rank') })

// Read with `run`.

export const countCards = query('countCards', { access: open, output: number(), run: ({ db }) => db.cards.count() })

export const titles = query('titles', {
  access: open,
  output: list(text()),
  run: ({ db }) =>
    db.cards
      .sort('rank')
      .all()
      .map((card) => card.title),
})

// What this query reads is another table once a notice stands: the tables of a group are taken anew from every run.
export const turning = query('turning', {
  access: open,
  output: number(),
  run: ({ db }) => (db.notices.count() === 0 ? 0 : db.cards.count()),
})

// A list in which every row stands twice: no two rows of a list of rows may hold one id.
export const twice = query('twice', {
  access: open,
  run: ({ db }) => {
    const all = db.cards.sort('rank').all()
    return [...all, ...all]
  },
})

// Answers the count of the cards, and a thousand more where it runs on the main thread.
export const heavyCount = query('heavyCount', {
  access: open,
  heavy: true,
  output: number(),
  run: ({ db }) => db.cards.count() + (isMainThread ? 1000 : 0),
})

// Written.

export const addCard = change('addCard', {
  access: open,
  input: { title: text(), rank: number() },
  set: cards.add({ title: input('title'), rank: input('rank') }),
})

export const moveCard = change('moveCard', {
  access: open,
  input: { card: text(), rank: number() },
  set: cards.change(input('card'), { rank: input('rank') }),
})

export const nameCard = change('nameCard', {
  access: open,
  input: { card: text(), title: text() },
  set: cards.change(input('card'), { title: input('title') }),
})

export const dropCard = change('dropCard', {
  access: open,
  input: { card: text() },
  set: cards.remove(input('card')),
})

export const addNotice = change('addNotice', {
  access: open,
  input: { text: text() },
  set: notices.add({ text: input('text') }),
})

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text(), roles: list(text()) },
  set: users.add({ name: input('name'), roles: input('roles') }),
})

export const setRoles = change('setRoles', {
  access: 'nobody',
  input: { user: text(), roles: list(text()) },
  set: users.change(input('user'), { roles: input('roles') }),
})

export const dropUser = change('dropUser', {
  access: 'nobody',
  input: { user: text() },
  set: users.remove(input('user')),
})

export const fillCards = change('fillCards', {
  access: 'nobody',
  input: { from: number(), to: number() },
  run: ({ db, input: given }) => {
    for (let rank = given.from; rank < given.to; rank++) db.cards.add({ title: `card ${rank}`, rank })
  },
})

export const turnCards = change('turnCards', {
  access: 'nobody',
  run: ({ db }) => {
    for (const card of db.cards.all()) db.cards.change(card.id, { rank: -card.rank })
  },
})

export const rawRank = change('rawRank', {
  access: 'nobody',
  system: 'it shows a raw write that states no table',
  input: { title: text(), rank: number() },
  run: ({ db, input: given }) => {
    db.sql('UPDATE "cards" SET "rank" = ? WHERE "title" = ?', [given.rank, given.title])
  },
})

export const rawStated = change('rawStated', {
  access: 'nobody',
  system: 'it shows a raw write that states its table',
  touches: [cards],
  input: { title: text(), rank: number() },
  run: ({ db, input: given }) => {
    db.sql('UPDATE "cards" SET "rank" = ? WHERE "title" = ?', [given.rank, given.title])
  },
})

export const ping = action('ping', { access: open, output: number(), run: async () => 1 })

// What a module keeps at its top: each opening of the bundle, and each version of an app, counts for itself.
let bumps = 0

export const bump = change('bump', { access: open, output: number(), run: () => ++bumps })
