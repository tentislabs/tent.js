import { project, table, text } from 'tentjs'

export const sealedSteps = project('sealedSteps', {})

// What is kept stored encrypted, each value by itself, which an action and a step of a flow both read.
export const vault = table('vault', {
  columns: { title: text(), note: text({ sealed: true }) },
  access: { read: 'anyone', add: 'anyone' },
})
