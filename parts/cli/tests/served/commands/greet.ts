import { command } from 'tentjs/cli'
import { hello } from '../functions'

// A command written in code, which runs on the person's computer once the address is added.
export const greet = command('greet', {
  about: 'Greets, from code',
  run: async ({ read, terminal }) => {
    terminal.write(`code says ${await read(hello, {})}\n`)
  },
})
