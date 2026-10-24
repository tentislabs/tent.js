import { action, change, input, log, query, table, text } from 'tentjs'

// A person with a private and a sealed column: neither value may leave through a key of the right `operate`.
export const people = table('people', {
  columns: { name: text(), ssn: text({ private: true }), pin: text({ sealed: true }) },
  access: { read: 'signedIn' },
})

export const addPerson = change('addPerson', {
  access: 'nobody',
  input: { name: text(), ssn: text(), pin: text() },
  set: people.add({ name: input('name'), ssn: input('ssn'), pin: input('pin') }),
})

// A card holds the private value alone, which a step of a run reads.
export const cards = table('cards', {
  columns: { name: text(), ssn: text({ private: true }) },
  access: { read: 'signedIn' },
})

export const addCard = change('addCard', {
  access: 'nobody',
  input: { name: text(), ssn: text() },
  set: cards.add({ name: input('name'), ssn: input('ssn') }),
})

export const everyone = query('everyone', { access: 'signedIn', rows: people.sort('name') })

// The builder's own code puts both values into a line of the log and into the words of an error, as code may.
export const checkPerson = action('checkPerson', {
  access: 'nobody',
  input: { id: text() },
  run: async ({ input, db }) => {
    const person = await db.people.get(input.id)
    log.info('checked a person', { ssn: person?.ssn, pin: person?.pin })
    throw new Error(`The person ${String(person?.ssn)} ${String(person?.pin)} is refused.`)
  },
})
