import { appendFileSync, existsSync, readFileSync, writeSync } from 'node:fs'
import { action, agent, change, input, list, model, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const addUser = change('addUser', {
  access: 'nobody',
  input: { name: text() },
  set: users.add({ name: input('name'), roles: [] }),
})

// An agreed function that notes each making in a file; at its first making the program stands still after the
// note, before the answer is saved, until it is killed.
export const notify = action('notify', {
  access: 'signedIn',
  input: { file: text() },
  danger: 'ask',
  run: async ({ input: given }) => {
    appendFileSync(given.file, 'made\n')
    const made = readFileSync(given.file, 'utf8').split('\n').filter(Boolean).length
    if (made === 1 && !existsSync(`${given.file}.again`)) {
      writeSync(1, 'made notify\n')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    }
  },
})

export const outer = action('outer', {
  about: 'Tells the team',
  access: 'signedIn',
  input: { file: text() },
  output: text(),
  sends: false,
  run: async ({ input: given }) => {
    await notify({ file: given.file })
    return 'told'
  },
})

export const guard = agent('guard', {
  model: writer,
  instructions: 'You tell.',
  tools: [outer],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 20 } },
})
