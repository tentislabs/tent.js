import { change, count, input, number, query, sum, text } from 'tentjs'
import { accounts, desks, staff } from '../tables/tables'

export const addStaff = change('addStaff', {
  access: 'signedIn',
  input: { name: text(), salary: number(), bonus: number({ optional: true }), manager: text({ optional: true }), about: text({ optional: true }) },
  set: staff.add({ name: input('name'), salary: input('salary'), bonus: input('bonus'), manager: input('manager'), about: input('about') }),
})

export const addDesk = change('addDesk', {
  access: 'signedIn',
  input: { label: text(), holder: text() },
  set: desks.add({ label: input('label'), holder: input('holder') }),
})

export const allStaff = query('allStaff', { access: 'signedIn', rows: staff.oldest('createdAt').limit(100) })

export const paidAbove = query('paidAbove', {
  access: 'signedIn',
  input: { least: number() },
  rows: staff.where({ salary: { above: input('least') } }).limit(100),
})

export const bySalary = query('bySalary', { access: 'signedIn', rows: staff.sort('salary').limit(100) })

export const salaries = query('salaries', {
  access: 'signedIn',
  rows: staff.group('manager', { n: count(), total: sum('salary') }),
})

export const bySalaryGroup = query('bySalaryGroup', { access: 'signedIn', rows: staff.group('salary', { n: count() }) })

export const searched = query('searched', {
  access: 'signedIn',
  input: { words: text() },
  rows: staff.search(input('words')).limit(100),
})

export const desksWithHolders = query('desksWithHolders', {
  access: 'signedIn',
  rows: desks.with('holder').oldest('createdAt').limit(100),
})

export const addAccount = change('addAccount', {
  access: 'signedIn',
  input: { email: text(), spare: text({ optional: true }) },
  set: accounts.add({ email: input('email'), spare: input('spare') }),
})

export const byEmail = query('byEmail', {
  access: 'signedIn',
  input: { email: text() },
  rows: accounts.where({ email: input('email') }).limit(10),
})

export const bySpare = query('bySpare', {
  access: 'signedIn',
  input: { email: text() },
  rows: accounts.where({ spare: input('email') }).limit(10),
})

// A sort and a range on a findable sealed value, written in code, which the check does not read.
export const sortedEmails = query('sortedEmails', {
  access: 'signedIn',
  output: number(),
  run: ({ db }) => db.accounts.sort('email').limit(10).all().length,
})

export const emailsAfter = query('emailsAfter', {
  access: 'signedIn',
  input: { email: text() },
  output: number(),
  run: ({ db, input: given }) => db.accounts.where({ email: { above: given.email } }).count(),
})
