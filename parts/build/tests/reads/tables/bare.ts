import { table, text } from 'tentjs' // the words of ours

export const bareTable = table('bareTable', {
  columns: { name: text({ max: 40 }) },
  access: { read: 'signedIn' },
})
