import { anyone, change, number, query, text } from 'tentjs'

const open = anyone('a test calls it')

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  output: text(),
  run: ({ db, input }) => db.teams.add({ name: input.name }).id,
})

// One write of the shared file: a note is added, the oldest one is counted on, and every fifth is removed.
export const writeNote = change('writeNote', {
  access: open,
  input: { title: text(), secret: text() },
  output: text(),
  run: ({ db, input }) => {
    const made = db.notes.add({ title: input.title, secret: input.secret })
    const oldest = db.notes.oldest('createdAt').first()
    if (oldest) db.notes.change(oldest.id, { count: oldest.count + 1 })
    if (db.notes.count() % 5 === 0 && oldest) db.notes.remove(oldest.id)
    return made.id
  },
})

// One write of a team's file: a task is added, and the oldest open one is marked done.
export const writeTask = change('writeTask', {
  access: open,
  input: { team: text(), title: text() },
  output: text(),
  run: ({ db, input }) => {
    const made = db.tasks.of(input.team).add({ title: input.title })
    const waiting = db.tasks.of(input.team).where({ done: false }).oldest('createdAt').first()
    if (waiting && waiting.id !== made.id) db.tasks.of(input.team).change(waiting.id, { done: true })
    return made.id
  },
})

export const countNotes = query('countNotes', {
  access: open,
  output: number(),
  run: ({ db }) => db.notes.count(),
})
