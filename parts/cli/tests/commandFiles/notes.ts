import { command, number, role } from 'tentjs/cli'
import { addNote, openNotes, whoAmI } from '../functions'

// A command that reads a line and a key, reads and calls as its caller, and writes a control code two ways.
export const desk = command('desk', {
  about: 'Walks through the notes at the desk',
  args: { limit: number({ default: 20 }) },
  run: async ({ args, rest, terminal, read, call, user }) => {
    terminal.write(`who: ${await read(whoAmI, {})} user: ${user?.id ?? 'none'}\n`)
    const line = await terminal.line()
    for await (const key of terminal.keys()) {
      terminal.write(`key: ${key.name}\n`)
      break
    }
    await call(addNote, { title: line ?? 'no line' })
    terminal.write(`notes: ${JSON.stringify(await read(openNotes, { limit: args.limit }))}\n`)
    terminal.write(`rest: ${rest.join(' ')}\n`)
    terminal.write(`bell${String.fromCharCode(7)}\n`)
    terminal.raw(`raw${String.fromCharCode(7)}\n`)
    return 3
  },
})

// A command that watches a live query until a note is added.
export const watchNotes = command('watchNotes', {
  about: 'Watches the notes until one more is there',
  run: async ({ watch, call, terminal }) => {
    const seen: string[][] = []
    await new Promise<void>((done) => {
      const stop = watch(openNotes, { limit: 20 }, (notes) => {
        seen.push(notes)
        if (seen.length === 1) void call(addNote, { title: 'watched' })
        else {
          stop()
          done()
        }
      })
    })
    terminal.write(`${JSON.stringify(seen)}\n`)
  },
})

// For the staff alone: the runner refuses another caller before `run`.
export const closeDesk = command('closeDesk', {
  about: 'Closes the desk',
  access: role('staff'),
  run: async ({ terminal }) => {
    terminal.write('closed\n')
  },
})
