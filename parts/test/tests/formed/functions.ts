import { boolean, change, choice, date, day, input, list, number, query, table, text } from 'tentjs'

export const stays = table('stays', {
  columns: {
    guest: text(),
    mail: text(),
    nights: number({ min: 1, max: 9, whole: true }),
    agreed: boolean(),
    at: date(),
    on: day(),
    size: choice(['small', 'large']),
    extras: list(choice(['bed', 'desk', 'view'])),
    price: number({ min: 0, whole: true }),
    quiet: boolean(),
  },
  access: { read: 'anyone', add: 'anyone' },
})

export const allStays = query('allStays', { access: 'anyone', rows: stays.oldest('guest') })

export const book = change('book', {
  access: 'anyone',
  input: {
    guest: text(),
    mail: text({ pattern: '^[^@ ]+@[^@ ]+$' }),
    nights: number({ min: 1, max: 9, whole: true }),
    agreed: boolean(),
    at: date(),
    on: day(),
    size: choice(['small', 'large']),
    extras: list(choice(['bed', 'desk', 'view'])),
    price: number({ min: 0, whole: true }),
    quiet: boolean(),
  },
  set: stays.add({
    guest: input('guest'),
    mail: input('mail'),
    nights: input('nights'),
    agreed: input('agreed'),
    at: input('at'),
    on: input('on'),
    size: input('size'),
    extras: input('extras'),
    price: input('price'),
    quiet: input('quiet'),
  }),
})
