import { link, number, object, python, role, table, text } from 'tentjs'

export const customers = table('customers', { columns: { name: text() }, access: { read: 'signedIn' } })

export const churnScore = python('churnScore', {
  about: 'How likely a customer is to leave',
  file: 'ml/churn.py',
  packages: ['tinyone>=1', 'natone'],
  files: ['ml/*.joblib', 'data/**/*.csv', 'venv/*.py'],
  input: { customer: link('customers'), months: number() },
  output: object({ risk: number() }),
  access: role('staff'),
})

export const oldScore = python('oldScore', {
  file: 'ml/old.py',
  packages: ['tinyone==1.0'],
  lock: 'old',
  input: {},
  output: number(),
  access: role('staff'),
})
