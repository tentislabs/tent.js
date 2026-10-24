import { action, link, table, text } from 'tentjs'

export const summarize = action('summarize', {
  access: 'nobody',
  system: 'fills the summary of a task from its own columns',
  input: { title: text(), note: text() },
  output: text(),
  run: async ({ input }) => `${input.title}: ${input.note}`,
})

export const teams = table('teams', {
  columns: { name: text() },
  access: { read: 'signedIn', add: 'signedIn' },
})

// The tasks of each team stand in a data file of that team; their summary is due two minutes after a write, by
// which time a file that nothing touched was closed.
export const tasks = table('tasks', {
  columns: {
    team: link('teams', { onRemove: 'remove' }),
    title: text(),
    note: text(),
    summary: text({ optional: true, by: { work: summarize, debounce: '2 minutes' } }),
  },
  tenant: 'team',
  access: { read: 'signedIn', add: 'signedIn' },
})
