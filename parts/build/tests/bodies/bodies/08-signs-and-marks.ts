import { each, log, query, sum } from 'tentjs'

type Line = { qty: number; price: number; note?: string }

export const signsAndMarks = query('signsAndMarks', {
  access: 'everyone',
  run: ({ input }) => {
    const lines = input.lines as Line[]
    const first: Line = lines[0]!
    const month = input.month satisfies string
    const net = each(lines, (l: Line) => {
      if (l.qty <= 0) return 0
      if (l.note === 'free' || l.price == null) {
        return 0
      } else return l.qty * l.price
    })
    const total = sum(net)
    const odd = lines.length % 2 !== 0
    for (const letter of input.code) {
      if (letter == '-') return { month, stopped: true }
      log.info(`letter ${letter}`)
    }
    for (const l of lines) if (l.qty > 99) return
    return {
      month,
      total,
      odd,
      half: total / 2,
      less: -total + first.qty,
      many: total > 100 && !odd,
      few: total < 10 || lines.length != 3,
      note: first.note ?? null,
      size: total >= 1000 ? 'large' : total > 100 ? 'middle' : 'small',
      nothing: undefined,
      flags: [true, false, null],
      gap: first.price - first.qty,
    }
  },
})
