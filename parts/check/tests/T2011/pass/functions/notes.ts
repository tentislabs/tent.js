import { query, table, text } from 'tentjs'

export const vault = table('vault', {
  columns: { name: text(), key: text({ sealed: true }) },
  access: { read: 'signedIn' },
})

export const byName = query('byName', { access: 'signedIn', rows: vault.where({ name: 'door' }).limit(20) })
