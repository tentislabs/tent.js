import { change, input, role, table, text } from 'tentjs'

export const audit = table('audit', { columns: { line: text() }, access: {} })

export const addLine = change('addLine', {
  access: role('staff'),
  system: 'nobody reads the audit, and the staff write it',
  input: { line: text() },
  set: audit.add({ line: input('line') }),
})
