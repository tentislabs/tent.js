import { action, change, input, number, query, text } from 'tentjs'
import { ledgerOfMARKERTABLE } from '../tables/ledger'

// MARKER-COMMENT-OF-THE-BACKEND-FILE-0123456789
/* MARKER-BLOCK-COMMENT-OF-THE-BACKEND-FILE-0123456789 */
const apiKey = 'MARKER-SECRET-OF-THE-BACKEND-FILE-0123456789'

/** The shape of what the vault answers, whose name a screen may import as a type. */
export interface VaultRowMARKERTYPE {
  amount: number
}

export const vaultRows = query('vaultRows', {
  access: 'signedIn',
  input: { limit: number({ default: 5 }) },
  run: ({ input, db }) =>
    db.ledgerOfMARKERTABLE
      .where({ note: { not: 'MARKER-QUERY-TEXT-0123456789' } })
      .limit(input.limit)
      .all(),
})

export const vaultPlain = query('vaultPlain', {
  access: 'signedIn',
  rows: ledgerOfMARKERTABLE.where({ note: 'MARKER-PLAIN-QUERY-TEXT-0123456789' }),
})

export const addToVault = change('addToVault', {
  access: 'signedIn',
  input: { amount: number(), note: text({ optional: true }) },
  set: ledgerOfMARKERTABLE.add({ amount: input('amount'), note: 'MARKER-CHANGE-TEXT-0123456789' }),
})

export const askVault = action('askVault', {
  access: 'signedIn',
  run: async () => `asked with ${apiKey.length} letters of MARKER-ACTION-TEXT-0123456789`,
})
