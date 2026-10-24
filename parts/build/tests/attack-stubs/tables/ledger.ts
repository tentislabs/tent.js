import { number, table, text, where } from 'tentjs'

// MARKER-COMMENT-OF-THE-TABLE-FILE-0123456789
export const ledgerOfMARKERTABLE = table('ledgerOfMARKERTABLE', {
  columns: {
    amount: number(),
    note: text({ optional: true }),
    ownerPinMARKERCOLUMN: text({ private: true, optional: true }),
  },
  access: {
    read: where((user) => {
      const rule = 'MARKER-RULE-OF-THE-TABLE-0123456789'
      return user ? { note: { not: rule } } : { note: 'none' }
    }),
  },
})
