import { caller, link, list, table, text, where } from 'tentjs'

export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })

export const teams = table('teams', { columns: { name: text() }, access: { read: 'signedIn' } })

export const members = table('members', {
  columns: { team: link('teams', { onRemove: 'remove' }), user: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A row of a tenant table is read by the members of its team.
const mine = () => where({ team: { in: members.where({ user: caller('id') }).pick(['team']) } })

export const shops = table('shops', { columns: { name: text() }, access: { read: 'signedIn' } })

// A link from a file into the shared file that refuses the removal: no single moment can hold it.
export const orders = table('orders', {
  columns: { team: link('teams', { onRemove: 'remove' }), placedBy: link('users'), title: text() },
  tenant: 'team',
  access: { read: mine() },
})

// A link into a tenant's file from the shared file.
export const stars = table('stars', {
  columns: { order: link('orders', { onRemove: 'remove' }), by: link('users', { onRemove: 'remove' }) },
  access: { read: 'signedIn' },
})

// A link between tenant tables whose tenants are of two different tables.
export const stock = table('stock', {
  columns: { shop: link('shops', { onRemove: 'remove' }), order: link('orders', { onRemove: 'remove' }) },
  tenant: 'shop',
  access: { read: where({ shop: caller('id') }) },
})
