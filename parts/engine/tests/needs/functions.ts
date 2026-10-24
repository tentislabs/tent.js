import { action, anyone, project, query, text } from 'tentjs'

// A fetch of a part is waited for as long as the project says, which is far less here than the two minutes.
export const needs = project('needs', { backups: { every: false }, limits: { fetchTime: '400 ms' } })

// What the test laid down for this call: the fetching of a part, as the engine does it for a call that needs one.
const part = (): Promise<string> => Reflect.get(globalThis, 'partOfTheTest')()

export const readsPart = action('readsPart', {
  access: anyone('it shows what a caller is sent when a part cannot be fetched'),
  output: text(),
  run: async () => await part(),
})

export const still = query('still', {
  access: anyone('it shows that the app keeps answering'),
  output: text(),
  run: () => 'still here',
})
