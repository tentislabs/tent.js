import { command, role } from 'tentjs/cli'

// A command of the app's own that the staff alone run.
export const greet = command('greet', {
  about: 'Greets the staff',
  access: role('staff'),
  run: async ({ terminal }) => {
    terminal.write('hello\n')
  },
})
