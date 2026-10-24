import { change, each, round, sum, where } from 'tentjs'

export const walkRows = change('walkRows', {
  access: 'everyone',
  run: ({ input, db }) => {
    const rows = db.orders.where({ status: 'open' }).all()
    const lines = each(rows, (o) => ({ id: o.id, gross: round(o.total * (1 + input.vat), 2), big: o.total > input.big }))
    for (const line of lines) {
      if (line.big) db.orders.change(line.id, { big: true })
    }
    return { count: rows.length, total: sum(lines, 'gross'), big: where(lines, { big: true }).length }
  },
})
