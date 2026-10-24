import { boolean, change, choice, date, fail, json, number, object, query, text } from 'tentjs'

export const usedToday = query('usedToday', {
  about: "The person's use of the day, by bot and in all, beside the day's limit",
  access: 'signedIn',
  output: object({
    day: date(),
    tokensIn: number(),
    tokensOut: number(),
    calls: number(),
    limit: number(),
    share: number(),
    byBot: json(),
  }),
  run: ({ db, now, user }) => {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const rows = db.usage
      .where({ day: { atLeast: day } })
      .limit(1000)
      .all()
    const total = { tokensIn: 0, tokensOut: 0, calls: 0 }
    for (const row of rows) {
      if (row.unit === 'tokensIn') total.tokensIn += Number(row.amount)
      if (row.unit === 'tokensOut') total.tokensOut += Number(row.amount)
      if (row.unit === 'calls') total.calls += Number(row.amount)
    }
    const turns = db.turns
      .where({ createdAt: { atLeast: day } })
      .limit(1000)
      .all()
    const byBot: Record<string, { tokensIn: number; tokensOut: number; runs: number }> = {}
    for (const one of turns) {
      const used = Object(one.used ?? {})
      const entry = byBot[one.bot] ?? { tokensIn: 0, tokensOut: 0, runs: 0 }
      entry.tokensIn += Number(used.tokensIn ?? 0)
      entry.tokensOut += Number(used.tokensOut ?? 0)
      entry.runs += 1
      byBot[one.bot] = entry
    }
    const preferences = user ? db.preferences.where({ owner: user.id }).first() : undefined
    const limit = preferences?.dayLimit ?? 200000
    return { day, ...total, limit, share: limit > 0 ? Math.min(1, total.tokensOut / limit) : 1, byBot }
  },
})

export const myPreferences = query('myPreferences', {
  about: "The person's settings, with the day's limit",
  access: 'signedIn',
  run: ({ db, user }) => (user ? db.preferences.where({ owner: user.id }).first() : undefined),
})

export const changePreferences = change('changePreferences', {
  about: "Changes the person's settings, the day's limit among them",
  access: 'signedIn',
  input: {
    dayLimit: number({ min: 0, whole: true, optional: true }),
    colorScheme: choice(['system', 'light', 'dark'], { optional: true }),
    spelling: boolean({ optional: true }),
    hardware: boolean({ optional: true }),
    autoReview: boolean({ optional: true }),
    execution: choice(['ask', 'always', 'never'], { optional: true }),
    zone: text({ max: 64, optional: true }),
  },
  run: ({ input, db, user }) => {
    if (!user) return fail('signed-out', 'Sign in first.')
    const set = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
    const mine = db.preferences.where({ owner: user.id }).first()
    return mine ? db.preferences.change(mine.id, set) : db.preferences.add({ ...set, owner: user.id })
  },
})
