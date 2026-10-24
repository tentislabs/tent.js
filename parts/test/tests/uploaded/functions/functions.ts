import { action, change, file, files, input, number, text } from 'tentjs'
import { papers } from '../tables/tables'

export const addPaper = change('addPaper', {
  access: 'signedIn',
  input: { title: text(), scan: file() },
  set: papers.add({ title: input('title'), scan: input('scan') }),
})

// A signed address for a time to the file of a paper, which the caller hands to someone who signs in nowhere.
export const shareScan = action('shareScan', {
  access: 'signedIn',
  input: { scan: text(), minutes: number() },
  output: text(),
  run: async ({ input: given }) => files.signedUrl(given.scan, { for: `${given.minutes} minutes` }),
})

// Its maker removes a loose file at once.
export const dropScan = action('dropScan', {
  access: 'signedIn',
  input: { scan: text() },
  output: text(),
  run: async ({ input: given }) => {
    await files.remove(given.scan)
    return 'removed'
  },
})
