import { change, fail, input, link, object, query, text } from 'tentjs'
import { skills } from '../tables/skills'

export const skillList = query('skillList', {
  about: "The skills of one bot: Claude Code's own skill files in the bot's folder",
  access: 'signedIn',
  input: { bot: link('bots') },
  rows: skills
    .where({ bot: input('bot') })
    .sort('name')
    .limit(200),
})

// The driver writes each row into the bot's folder before a turn, as `.claude/skills/<name>/SKILL.md`.
export const saveSkill = change('saveSkill', {
  about: 'Adds a skill to a bot, or changes the one of that name',
  access: 'signedIn',
  input: {
    bot: link('bots'),
    name: text({ min: 1, max: 64, pattern: '^[a-z0-9][a-z0-9-]*$' }),
    about: text({ max: 1024, default: '' }),
    body: text({ lines: 'many', default: '' }),
  },
  output: object({ id: link('skills') }),
  run: ({ input, db, user }) => {
    if (!user) return fail('signed-out', 'Sign in first.')
    if (!db.bots.get(input.bot)) return fail('no-such-bot', 'That bot is not there.')
    const same = db.skills.where({ bot: input.bot, name: input.name }).first()
    if (same) return db.skills.change(same.id, { about: input.about, body: input.body })
    return db.skills.add({ ...input, owner: user.id })
  },
})

export const removeSkill = change('removeSkill', {
  about: 'Removes a skill of a bot',
  access: 'signedIn',
  input: { id: link('skills') },
  run: ({ input, db }) => {
    db.skills.remove(input.id)
  },
})
