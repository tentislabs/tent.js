import { boolean, change, date, fail, input, link, object, query, start, text } from 'tentjs'
import { bot } from '../agents/bot'
import { nextAfter, readSchedule, zoneOffset } from '../lib/schedule'
import { routines } from '../tables/routines'

export const routineList = query('routineList', {
  about: 'The routines of one bot, the next to run first',
  access: 'signedIn',
  input: { bot: link('bots') },
  rows: routines
    .where({ bot: input('bot') })
    .oldest('next')
    .limit(50),
})

export const addRoutine = change('addRoutine', {
  about: 'Gives a bot a routine: a task on a schedule in words, or when an event happens',
  access: 'signedIn',
  input: {
    bot: link('bots'),
    task: text({ min: 1, max: 4000, lines: 'many' }),
    every: text({ max: 200, optional: true }),
    on: text({ max: 200, optional: true }),
  },
  output: object({ id: link('routines'), next: date({ optional: true }) }),
  run: ({ input, db, now, user }) => {
    if (!user) return fail('signed-out', 'Sign in first.')
    const owned = db.bots.get(input.bot)
    if (!owned) return fail('no-such-bot', 'That bot is not there.')
    if (!input.every === !input.on) return fail('when', 'Give the routine a schedule or an event, one of them.')
    if (db.routines.count({ bot: input.bot }) >= 50) return fail('too-many', 'A bot has 50 routines at most.')
    let next: Date | undefined
    if (input.every) {
      const schedule = readSchedule(input.every)
      if (!schedule)
        return fail('schedule', `"${input.every}" is no schedule: say "every day at 08:00" or "every 2 hours".`, {
          fields: { every: 'This is no schedule.' },
        })
      if (schedule.kind === 'interval' && schedule.minutes < 5)
        return fail('schedule', 'A routine runs at most every 5 minutes.', { fields: { every: 'Too often.' } })
      const zone = db.preferences.where({ owner: user.id }).first()
      next = nextAfter(schedule, now, zoneOffset(zone?.zone, now))
    }
    return db.routines.add({ bot: input.bot, task: input.task, every: input.every, on: input.on, next, owner: user.id })
  },
})

export const removeRoutine = change('removeRoutine', {
  about: 'Removes a routine',
  access: 'signedIn',
  input: { id: link('routines') },
  run: ({ input, db }) => {
    db.routines.remove(input.id)
  },
})

export const pauseRoutine = change('pauseRoutine', {
  about: 'Pauses a routine, or lets it run again',
  access: 'signedIn',
  input: { id: link('routines'), paused: boolean() },
  run: ({ input, db }) => db.routines.change(input.id, { paused: input.paused }),
})

// The clock flow calls it each minute: each routine whose time has come starts its bot, and its time moves on.
export const startDueRoutines = change('startDueRoutines', {
  about: 'Starts each routine whose next moment has come, and moves that moment on',
  access: 'nobody',
  system: 'the clock starts the routines of every person',
  run: ({ db, now }) => {
    const due = db.system.routines
      .where({ paused: false, next: { atMost: now } })
      .limit(500)
      .all()
    for (const one of due) {
      start(bot, { message: one.task, thread: one.bot })
      const schedule = one.every ? readSchedule(one.every) : undefined
      const zone = db.system.preferences.where({ owner: one.owner }).first()
      let next = schedule ? nextAfter(schedule, one.next ?? now, zoneOffset(zone?.zone, now)) : undefined
      while (schedule && next && next.getTime() <= now.getTime())
        next = nextAfter(schedule, next, zoneOffset(zone?.zone, now))
      db.system.routines.change(one.id, { next })
    }
    return { started: due.length }
  },
})
