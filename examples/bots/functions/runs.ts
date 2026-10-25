import { action, boolean, change, fail, input, link, query, runs, text } from 'tentjs'
import { asks } from '../tables/asks'
import { turns } from '../tables/turns'

export const runList = query('runList', {
  about: 'The runs of one bot, the newest first, whoever started them',
  access: 'signedIn',
  input: { bot: link('bots') },
  rows: turns
    .where({ bot: input('bot') })
    .newest('createdAt')
    .limit(50),
})

export const runsUnder = query('runsUnder', {
  about: 'The runs that one run handed work to, as the chief hands it to its bots',
  access: 'signedIn',
  input: { run: text({ max: 80 }) },
  rows: turns
    .where({ under: input('run') })
    .with('bot')
    .oldest('createdAt')
    .limit(20),
})

export const askList = query('askList', {
  about: 'The asks that wait for the person, the oldest first',
  access: 'signedIn',
  rows: asks.where({ state: 'waiting' }).with('bot').oldest('createdAt').limit(100),
})

export const asksOfBot = query('asksOfBot', {
  about: 'The asks of one bot, answered or waiting, the oldest first',
  access: 'signedIn',
  input: { bot: link('bots') },
  rows: asks
    .where({ bot: input('bot') })
    .oldest('createdAt')
    .limit(100),
})

// The person's Yes or No goes to the run that waits for it; a question takes the words of the choice too.
export const answerAsk = action('answerAsk', {
  about: 'Answers an ask of a run: Yes or No, or the choice of a question',
  access: 'signedIn',
  system: 'it answers the step of a run that waits for its owner, once the row says the caller owns it',
  input: { ask: link('asks'), yes: boolean(), answer: text({ max: 2000, optional: true }) },
  run: async ({ input, db }) => {
    const one = await db.asks.get(input.ask)
    if (!one) return fail('no-such-ask', 'That ask is not there.')
    if (one.state !== 'waiting') return fail('answered', 'That ask was answered already.')
    const data = { answer: input.answer ?? null }
    if (input.yes) await runs.approve(one.run, one.step, data, { repeat: one.repeat })
    else await runs.refuse(one.run, one.step, data, { repeat: one.repeat })
    await closeAsk({ ask: one.id, yes: input.yes, answer: input.answer })
    return { ok: true }
  },
})

export const closeAsk = change('closeAsk', {
  about: 'Marks an ask as answered',
  access: 'signedIn',
  system: 'the asks table is written by the app alone',
  input: { ask: link('asks'), yes: boolean(), answer: text({ max: 2000, optional: true }) },
  run: ({ input, db }) => {
    if (!db.asks.get(input.ask)) return fail('no-such-ask', 'That ask is not there.')
    return db.system.asks.change(input.ask, { state: input.yes ? 'yes' : 'no', answer: input.answer })
  },
})
