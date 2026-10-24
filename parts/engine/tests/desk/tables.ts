import { anyone, boolean, link, list, number, project, role, table, text, vector } from 'tentjs'

export const desk = project('desk', {
  settings: { shopName: { type: text({ default: 'The desk' }) } },
  limits: { functionDepth: 6 },
})

export const users = table('users', {
  columns: { name: text(), roles: list(text()), salary: number({ optional: true, private: true }) },
  access: { read: 'signedIn' },
})

export const notes = table('notes', {
  columns: {
    title: text(),
    owner: link('users'),
    done: boolean({ default: false }),
    secret: text({ optional: true, private: true }),
  },
  owner: 'owner',
  access: { read: 'owner', add: 'signedIn', change: 'owner', remove: 'owner' },
})

export const tags = table('tags', {
  columns: { name: text() },
  access: { read: anyone('the tags are shown to every visitor'), add: role('staff') },
})

export const docs = table('docs', {
  columns: { title: text(), meaning: vector({ size: 3 }) },
  access: { read: anyone('the documents are public') },
})

export const words = table('words', {
  columns: { text: text({ unique: true }) },
  access: {
    read: anyone('the words are shown to every visitor'),
    add: anyone('a visitor may add a word'),
    change: anyone('a visitor may mend a word'),
    remove: anyone('a visitor may take a word away'),
  },
})

export const uses = table('uses', {
  columns: { word: link('words') },
  access: { read: anyone('the uses are shown to every visitor'), add: anyone('a visitor may note a use') },
})
