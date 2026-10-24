import { agent, input, model, number, query, secret, sum } from 'tentjs'
import { staff } from '../tables/tables'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const allStaff = query('allStaff', {
  about: 'Every person of the staff.',
  access: 'signedIn',
  input: {},
  rows: staff.oldest('createdAt').limit(100),
})

export const paidAbove = query('paidAbove', {
  about: 'The staff paid above a sum.',
  access: 'signedIn',
  input: { least: number() },
  rows: staff.where({ salary: { above: input('least') } }).limit(100),
})

export const bySalary = query('bySalary', {
  about: 'The staff, the lowest paid first.',
  access: 'signedIn',
  input: {},
  rows: staff.sort('salary').limit(100),
})

export const salaryTotals = query('salaryTotals', {
  about: 'What each person of the staff is paid in all.',
  access: 'signedIn',
  input: {},
  rows: staff.group('name', { total: sum('salary') }),
})

export const helper = agent('helper', {
  model: writer,
  instructions: 'You help.',
  tools: [allStaff, paidAbove, bySalary, salaryTotals],
  access: 'signedIn',
  limits: { steps: 6, perRun: { calls: 100 } },
})
