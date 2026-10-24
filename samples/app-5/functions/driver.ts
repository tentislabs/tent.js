import { change, choice, fail, json, link, list, number, object, query, start, text } from 'tentjs'
import { bot } from '../agents/bot'

// The driver of engine.ts calls these from the steps of a run, as the run's starter or as the system: a person
// reaches only the rows of their own bots.

export const botOfRun = query('botOfRun', {
  about: "What the driver needs of a bot for a turn: its row, its apps, its skills, and its person's limit",
  access: 'signedIn',
  system: 'a run of the clock or of the chief works for the owner of the bot',
  input: { bot: link('bots') },
  output: json(),
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return null
    const apps = db.system.apps
      .where({ owner: one.owner })
      .limit(100)
      .all()
      .filter((app) => one.apps.includes(app.id))
      .map((app) => ({ id: app.id, name: app.name, command: app.command ?? '', address: app.address ?? '' }))
    const skills = db.system.skills
      .where({ bot: one.id })
      .limit(200)
      .all()
      .map((skill) => ({ name: skill.name, about: skill.about, body: skill.body }))
    const preferences = db.system.preferences.where({ owner: one.owner }).first()
    const owner = db.system.users.get(one.owner)
    const others = db.system.bots
      .where({ owner: one.owner, kind: 'bot' })
      .oldest('createdAt')
      .limit(200)
      .all()
      .map((other) => ({ id: other.id, name: other.name, brief: other.brief }))
    return {
      bot: { id: one.id, name: one.name, brief: one.brief, model: one.model, kind: one.kind, owner: one.owner },
      apps,
      skills,
      others,
      person: { id: one.owner, name: owner?.name ?? '' },
      execution: preferences?.execution ?? 'ask',
    }
  },
})

export const noteTurn = change('noteTurn', {
  about: 'Writes that a run of a bot began',
  access: 'signedIn',
  system: 'the driver writes the runs of every bot',
  input: {
    bot: link('bots'),
    run: text({ max: 80 }),
    by: choice(['person', 'routine', 'chief']),
    task: text({ lines: 'many', default: '' }),
    under: text({ max: 80, optional: true }),
    folder: text({ max: 1000, optional: true }),
  },
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return null
    if (input.folder && one.folder !== input.folder) db.system.bots.change(one.id, { folder: input.folder })
    const same = db.system.turns.where({ run: input.run }).first()
    if (same) return db.system.turns.change(same.id, { state: 'running' })
    return db.system.turns.add({
      bot: input.bot,
      run: input.run,
      by: input.by,
      task: input.task,
      under: input.under,
      owner: one.owner,
    })
  },
})

export const endTurn = change('endTurn', {
  about: 'Writes how a run of a bot ended, with what it used',
  access: 'signedIn',
  system: 'the driver writes the runs of every bot',
  input: {
    run: text({ max: 80 }),
    state: choice(['running', 'waiting', 'done', 'failed', 'stopped']),
    answer: text({ lines: 'many', optional: true }),
    error: json({ optional: true }),
    used: json({ optional: true }),
  },
  run: ({ input, db, now, user }) => {
    const one = db.system.turns.where({ run: input.run }).first()
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return null
    const ended = input.state === 'running' || input.state === 'waiting' ? undefined : now
    return db.system.turns.change(one.id, {
      state: input.state,
      answer: input.answer ?? one.answer,
      error: input.error ?? one.error,
      used: input.used ?? one.used,
      ended,
    })
  },
})

export const remember = change('remember', {
  about: "Writes rows of a bot's talk: what the person said, what the bot wrote, and what it did",
  access: 'signedIn',
  system: 'the driver writes the talk of every bot',
  input: {
    bot: link('bots'),
    run: text({ max: 80 }),
    rows: list(json(), { max: 500 }),
  },
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return []
    return input.rows.map((row) => {
      const entry = Object(row)
      const who = entry.who === 'user' || entry.who === 'tool' || entry.who === 'summary' ? entry.who : 'assistant'
      return db.system.memories.add({
        who,
        text: typeof entry.text === 'string' ? entry.text : undefined,
        data: entry.data ?? undefined,
        run: input.run,
        bot: one.id,
        by: one.owner,
      })
    })
  },
})

export const openAsk = change('openAsk', {
  about: 'Writes an ask that a run waits for',
  access: 'signedIn',
  system: 'the driver writes the asks of every bot',
  input: {
    bot: link('bots'),
    run: text({ max: 80 }),
    step: text({ max: 200 }),
    repeat: number({ whole: true, default: 1 }),
    kind: choice(['permission', 'question']),
    tool: text({ max: 200, default: '' }),
    input: json({ optional: true }),
    question: text({ lines: 'many', optional: true }),
    choices: list(text(), { default: [] }),
  },
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return null
    const same = db.system.asks.where({ run: input.run, step: input.step, repeat: input.repeat }).first()
    if (same) return same
    return db.system.asks.add({ ...input, owner: one.owner })
  },
})

export const settleAsk = change('settleAsk', {
  about: 'Marks an ask as answered once its run has read the answer',
  access: 'signedIn',
  system: 'the driver writes the asks of every bot',
  input: {
    run: text({ max: 80 }),
    step: text({ max: 200 }),
    repeat: number({ whole: true, default: 1 }),
    yes: json({ optional: true }),
    answer: text({ max: 2000, optional: true }),
  },
  run: ({ input, db, user }) => {
    const one = db.system.asks.where({ run: input.run, step: input.step, repeat: input.repeat }).first()
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (one?.state !== 'waiting') return one ?? null
    return db.system.asks.change(one.id, { state: input.yes === true ? 'yes' : 'no', answer: input.answer })
  },
})

export const keepSkill = change('keepSkill', {
  about: "Keeps a skill that Claude Code wrote into a bot's folder",
  access: 'signedIn',
  system: 'the driver copies the skill files of every bot',
  input: {
    bot: link('bots'),
    name: text({ min: 1, max: 64, pattern: '^[a-z0-9][a-z0-9-]*$' }),
    about: text({ max: 1024, default: '' }),
    body: text({ lines: 'many', default: '' }),
  },
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return null
    const same = db.system.skills.where({ bot: one.id, name: input.name }).first()
    if (same) {
      if (same.body === input.body && same.about === input.about) return same
      return db.system.skills.change(same.id, { about: input.about, body: input.body })
    }
    return db.system.skills.add({ ...input, owner: one.owner })
  },
})

// The person's own limit of a day: the run is refused once the bots of its person used it up.
export const dayLimitOf = query('dayLimitOf', {
  about: "Refuses a run whose person used up the day's limit, and answers what is left",
  access: 'signedIn',
  system: 'a run of the clock or of the chief works for the owner of the bot',
  input: { bot: link('bots') },
  output: json(),
  run: ({ input, db, now, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return fail('no-such-bot', 'That bot is not there.')
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    let used = 0
    for (const turn of db.system.turns
      .where({ owner: one.owner, createdAt: { atLeast: day } })
      .limit(5000)
      .all())
      used += Number(Object(turn.used ?? {}).tokensOut ?? 0)
    const limit = db.system.preferences.where({ owner: one.owner }).first()?.dayLimit ?? 200000
    if (used >= limit)
      return fail('day-limit', `The bots used ${used} of the day's ${limit} tokens: the limit holds until tomorrow.`, {
        fields: { used: String(used), limit: String(limit) },
      })
    return { used, limit, left: limit - used }
  },
})

export const fillBrief = change('fillBrief', {
  about: 'Writes the brief of a bot that had none, from what the person answered it',
  access: 'signedIn',
  system: 'the driver writes what the person answered a new bot',
  input: { bot: link('bots'), brief: text({ max: 4000, lines: 'many' }) },
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one || one.brief) return one ?? null
    return db.system.bots.change(one.id, { brief: input.brief })
  },
})

// The chief hands a task on: a run of that bot starts at once, written under the chief's run.
export const handTask = change('handTask', {
  about: 'Starts a run of a bot with a task that the chief hands it',
  access: 'signedIn',
  system: 'the chief hands work to the bots of its person',
  input: { bot: link('bots'), task: text({ lines: 'many' }), under: text({ max: 80 }) },
  output: object({ run: text() }),
  run: ({ input, db, user }) => {
    const one = db.system.bots.get(input.bot)
    if (one && user && one.owner !== user.id) return fail('not-yours', 'That is not yours.')
    if (!one) return fail('no-such-bot', 'That bot is not there.')
    const { run } = start(bot, { message: input.task, thread: one.id })
    db.system.turns.add({ bot: one.id, run, by: 'chief', task: input.task, under: input.under, owner: one.owner })
    return { run }
  },
})
