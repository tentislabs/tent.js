import { boolean, change, fail, link, role, text } from 'tentjs'

// The two changes of the rent app that state `system`, with their checks by hand taken out: any renter may
// tell of any rent, and any landlord may mark the rent of a home that is not theirs.

export const tellPaid = change('tellPaid', {
  about: 'A renter tells the landlord they paid a rent',
  access: 'signedIn',
  system: 'a renter writes the state of their own rent, which no rule lets a caller write',
  input: { rent: link('rents'), note: text({ max: 200, optional: true }) },
  run: ({ input, db }) => {
    const rent = db.system.rents.get(input.rent)
    if (!rent) return fail('not-found', 'There is no such rent.')
    db.system.rents.change(rent.id, { status: 'told', toldNote: input.note })
  },
})

export const markRent = change('markRent', {
  about: 'The landlord says the money of a rent came, or that it did not',
  access: role('landlord'),
  system: 'the landlord writes the rents of their own homes',
  input: { rent: link('rents'), paid: boolean() },
  run: ({ input, db }) => {
    // The role alone holds no row: any landlord reaches here.
    const rent = db.system.rents.get(input.rent)
    if (!rent) return fail('not-found', 'There is no such rent.')
    db.system.rents.change(rent.id, { status: input.paid ? 'paid' : 'due' })
  },
})
