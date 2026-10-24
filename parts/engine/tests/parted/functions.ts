import { action, anyone, text } from 'tentjs'

// What the test laid down for this call: the fetching of a part, as the engine does it for a call that needs one.
const part = (): Promise<string> => Reflect.get(globalThis, 'partOfTheTest')()

export const readsPart = action('readsPart', {
  access: anyone('a test has a call fetch a part'),
  output: text(),
  run: async () => await part(),
})

// An action that only waits, for as long as the fetch of the part took: it passes its time.
export const waits = action('waits', {
  access: anyone('a test has a call wait'),
  output: text(),
  run: async () => {
    await new Promise((done) => setTimeout(done, 1200))
    return 'late'
  },
})
