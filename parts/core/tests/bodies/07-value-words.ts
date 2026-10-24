import { avg, contains, each, fingerprint, floor, join, lower, max, min, query, range, round, slice, sum, trim, upper, where, concat } from 'tentjs'

export const valueWords = query('valueWords', {
  access: 'everyone',
  run: ({ input, db }) => {
    const rows = db.orders.where({ status: 'open' }).all()
    const lines = each(rows, (o, i) => ({ place: i + 1, id: o.id, gross: round(o.total * 1.2, 2) }))
    const big = where(rows, { total: { above: input.above } })
    return {
      lines,
      total: sum(rows, 'total'),
      mean: avg(rows, 'total'),
      least: min(rows, 'total'),
      most: max(rows, 'total'),
      bigIds: join(each(big, (o) => o.id), ', '),
      marks: range(0, input.above, 100),
      firstTwo: slice(rows, 0, 2).length,
      name: concat(upper(slice(input.name, 0, 1)), lower(slice(input.name, 1))),
      clean: trim(input.note),
      late: contains(input.note, 'late'),
      whole: floor(sum(rows, 'total') / rows.length),
      print: fingerprint(input.name),
    }
  },
})
