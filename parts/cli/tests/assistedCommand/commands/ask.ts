import { command } from 'tentjs/cli'
import { helper } from '../agents'

// A command that starts the agent and follows its run, printing its text as it is written.
export const ask = command('ask', {
  about: 'Asks the helper',
  run: async ({ call, follow, terminal }) => {
    const { run } = Object(await call(helper, { message: 'Hello' }))
    // The text of a run that ended before it was followed comes whole with its end.
    let seen = false
    for await (const part of follow(String(run))) {
      const kind: unknown = Reflect.get(part, 'kind')
      if (kind === 'text') terminal.write(String(Reflect.get(part, 'text')))
      if (kind === 'done') terminal.write(`${seen ? '' : String(Reflect.get(part, 'text') ?? '')}\n`)
      if (kind === 'text') seen = true
    }
    return 0
  },
})
