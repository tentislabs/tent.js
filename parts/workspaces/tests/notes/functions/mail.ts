import { action, anyone, mail, query, table, text } from 'tentjs'

export const letters = table('letters', {
  columns: { to: text(), code: text({ private: true, optional: true }) },
  access: { read: anyone('the letters of a test app'), add: anyone('the letters of a test app') },
})

export const allLetters = query('allLetters', {
  about: 'Every letter',
  access: anyone('the letters of a test app'),
  rows: letters.newest('createdAt').limit(100),
})

// A plain action that sends data out: a run of it asks the person first.
export const mailNote = action('mailNote', {
  about: 'Mails a note to an address',
  input: { to: text(), body: text() },
  access: anyone('the letters of a test app'),
  run: async ({ input }) => {
    await mail.send({ to: input.to, subject: 'A note', text: input.body })
  },
})
