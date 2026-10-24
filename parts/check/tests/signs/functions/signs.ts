import { boolean, calc, date, input, link, list, number, query, settings, table, text } from 'tentjs'

const first = input('first')
const shopName = settings.shopName

export const stamps = table('stamps', {
  columns: { at: date(), tags: list(text()) },
  access: { read: 'signedIn' },
})

export const apart = query('apart', {
  access: 'signedIn',
  about: String(first),
  input: { a: date(), b: date() },
  output: number(),
  run: ({ input }) => input.a - input.b,
})

export const same = query('same', {
  access: 'signedIn',
  about: String(shopName),
  input: { stamp: link('stamps'), at: date() },
  output: boolean(),
  run: ({ input, db }) => {
    const stamp = db.stamps.get(input.stamp)
    return stamp?.at === input.at
  },
})

export const told = query('told', {
  access: 'signedIn',
  input: { at: date() },
  output: text(),
  run: ({ input }) => `at ${input.at}`,
})

export const byCalc = query('byCalc', {
  access: 'signedIn',
  input: { a: date(), b: date() },
  rows: stamps.where({ tags: { contains: calc('==', input('a'), input('b')) } }).limit(5),
})

export const lists = query('lists', {
  access: 'signedIn',
  input: { tags: list(text()) },
  output: boolean(),
  run: ({ input, db }) => {
    const all = db.stamps.limit(5).all()
    return all == input.tags || [1] === [1]
  },
})

export const fine = query('fine', {
  access: 'signedIn',
  input: { a: date(), b: date(), n: number(), tags: list(text()) },
  output: boolean(),
  run: ({ input }) => input.a < input.b && input.n == 1 && input.tags.length == 0,
})
