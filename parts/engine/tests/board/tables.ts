import { anyone, list, number, project, table, text } from 'tentjs'

export const board = project('board', {})

export const users = table('users', {
  columns: { name: text(), roles: list(text()) },
  access: { read: 'signedIn' },
})

export const cards = table('cards', {
  columns: { title: text(), rank: number() },
  access: {
    read: anyone('the cards are shown to every visitor'),
    add: anyone('a visitor may add a card'),
    change: anyone('a visitor may move a card'),
    remove: anyone('a visitor may take a card away'),
  },
})

export const notices = table('notices', {
  columns: { text: text() },
  access: { read: anyone('the notices are shown to every visitor'), add: anyone('a visitor may add a notice') },
})
