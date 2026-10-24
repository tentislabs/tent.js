import { action, change, input, log, query, table, text } from 'tentjs'

export const marks = table('marks', {
  columns: { what: text() },
  access: { read: 'signedIn' },
})

export const addMark = change('addMark', {
  access: 'nobody',
  input: { what: text() },
  set: marks.add({ what: input('what') }),
})

export const allMarks = query('allMarks', { access: 'nobody', rows: marks.oldest('createdAt') })

// The work of a step: it writes a line of the log each time it is carried out, and a mark.
export const note = action('note', {
  access: 'nobody',
  input: { what: text() },
  run: async ({ input }) => {
    log.info('noted', { what: input.what })
    addMark({ what: input.what })
  },
})

let tried = 0

// Work that fails the first time it is carried out, and works from then on.
export const flaky = action('flaky', {
  access: 'nobody',
  output: text(),
  run: async () => {
    tried += 1
    if (tried === 1) throw new Error('the first try fails')
    return `worked at try ${tried}`
  },
})
