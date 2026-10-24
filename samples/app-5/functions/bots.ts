import { boolean, change, choice, date, fail, input, link, list, object, query, start, text } from 'tentjs'
import { bot } from '../agents/bot'
import { botColours, botShapes } from '../lib/looks'
import { bots } from '../tables/bots'

export const botList = query('botList', {
  about: 'The bots of the person, the chief first, each with the last line of its talk',
  access: 'signedIn',
  output: list(
    object({
      id: link('bots'),
      name: text(),
      brief: text(),
      model: choice(['thinker', 'quick']),
      kind: choice(['bot', 'chief']),
      shape: choice([...botShapes]),
      colour: choice([...botColours]),
      apps: list(text()),
      folder: text({ optional: true }),
      createdAt: date(),
      last: object({ text: text(), who: text(), at: date() }, { optional: true }),
      working: boolean(),
      waiting: boolean(),
    }),
  ),
  run: ({ db }) =>
    db.bots
      .oldest('createdAt')
      .limit(200)
      .all()
      .map((one) => {
        const last = db.memories
          .where({ bot: one.id, who: { in: ['user', 'assistant'] } })
          .newest('createdAt')
          .first()
        const working = db.turns.count({ bot: one.id, state: 'running' }) > 0
        const waiting = db.asks.count({ bot: one.id, state: 'waiting' }) > 0
        return {
          id: one.id,
          name: one.name,
          brief: one.brief,
          model: one.model,
          kind: one.kind,
          shape: one.shape,
          colour: one.colour,
          apps: one.apps,
          folder: one.folder,
          createdAt: one.createdAt,
          last: last ? { text: last.text ?? '', who: last.who, at: last.createdAt } : undefined,
          working,
          waiting,
        }
      })
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'chief' ? -1 : 1)),
})

export const getBot = query('getBot', {
  about: 'One bot of the person',
  access: 'signedIn',
  input: { id: link('bots') },
  rows: bots.get(input('id')),
})

export const readBrief = query('readBrief', {
  about: 'The name and the brief of one bot, by its name',
  access: 'signedIn',
  input: { name: text({ max: 60 }) },
  output: object({ name: text(), brief: text() }),
  run: ({ input, db }) => {
    const one = db.bots.where({ name: input.name }).first()
    if (!one) return fail('no-such-bot', `There is no bot named ${input.name}.`)
    return { name: one.name, brief: one.brief }
  },
})

// A new bot greets its person at once and asks what to focus on first.
export const addBot = change('addBot', {
  about: 'Makes a bot, which greets its person and asks what to focus on first',
  access: 'signedIn',
  input: {
    name: text({ min: 1, max: 60 }),
    brief: text({ max: 4000, lines: 'many', default: '' }),
    shape: choice([...botShapes], { default: 'round' }),
    colour: choice([...botColours], { default: 'orange' }),
    model: choice(['thinker', 'quick'], { default: 'thinker' }),
    greet: boolean({ default: true }),
  },
  output: object({ id: link('bots'), name: text() }),
  run: ({ input, db, user }) => {
    if (!user) return fail('signed-out', 'Sign in first.')
    const made = db.bots.add({
      name: input.name.trim(),
      brief: input.brief,
      shape: input.shape,
      colour: input.colour,
      model: input.model,
      owner: user.id,
    })
    if (input.greet) start(bot, { message: '', thread: made.id })
    return made
  },
})

export const changeBot = change('changeBot', {
  about: 'Changes the name, the brief, the model, the face or the apps of a bot',
  access: 'signedIn',
  input: {
    id: link('bots'),
    name: text({ min: 1, max: 60, optional: true }),
    brief: text({ max: 4000, lines: 'many', optional: true }),
    model: choice(['thinker', 'quick'], { optional: true }),
    shape: choice([...botShapes], { optional: true }),
    colour: choice([...botColours], { optional: true }),
    apps: list(text(), { optional: true }),
  },
  run: ({ input, db }) => {
    const { id, ...values } = input
    const set = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
    return db.bots.change(id, set)
  },
})

export const removeBot = change('removeBot', {
  about: 'Removes a bot with its talk, its routines and its runs',
  access: 'signedIn',
  input: { id: link('bots') },
  run: ({ input, db }) => {
    const one = db.bots.get(input.id)
    if (!one) return fail('no-such-bot', 'That bot is not there.')
    if (one.kind === 'chief') return fail('chief-stays', 'The chief stays: it routes what you ask.')
    db.bots.remove(input.id)
  },
})
