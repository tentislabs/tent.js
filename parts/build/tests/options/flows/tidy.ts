import { agent, boolean, event, every, flow, link, object, text } from 'tentjs'
import { countNotes } from '../functions/notes'
import { embedder } from '../models/writer'
import { notes } from '../tables/notes'

export const nightly = flow('nightly', {
  about: 'Tidies up',
  input: { team: link('teams') },
  output: object({ done: boolean() }),
  as: 'starter',
  run: async () => ({ done: true }),
})

export const tidy = flow('tidy', {
  run: async ({ input, step }) => {
    await step('count', () => countNotes())
    return { team: input.team }
  },
  on: [every('day at 09:00'), notes.added({ where: { body: 'tidy' } })],
  about: 'Tidies the notes of a team',
  input: { team: link('teams') },
  output: object({ team: text() }),
  limits: { steps: 1000, time: '30 days', result: '1 MB', wait: '1 year', pass: '5 seconds', stepTime: '10 minutes' },
  tries: { max: 4, wait: '1 minute' },
  together: { max: 5, then: 'wait' },
  moveRuns: 'whenSafe',
  onFail: ({ failure }) => failure.code,
  as: 'starter',
  danger: 'ask',
  offer: ['api'],
  access: 'signedIn',
  system: 'tidies for every team',
  sends: false,
  follow: 'signedIn',
  countBy: 'limits',
  pace: { debounce: '30 seconds', perMinute: 10, drop: { max: 5, per: '1 hour' }, batch: { max: 20, wait: '2 minutes' } },
  plain: true,
  was: 'tidyUp',
})

export const hear = flow('hear', {
  on: event('run.failed', { where: { flow: 'tidy' } }),
  run: async () => ({ heard: true }),
})

export const helper = agent('helper', {
  model: embedder,
  instructions: 'You help with notes.',
  tools: [countNotes, { tool: nightly, tries: 2, about: 'Tidies up at once', line: false, name: 'tidyNow' }],
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '10 minutes', ask: '7 days', result: '1 MB', toolCalls: 100, toolsAtOnce: 8, pass: '5 seconds' },
  about: 'Answers questions about notes',
  access: 'signedIn',
  offer: ['mcp'],
  on: every('monday at 08:00'),
  memory: { in: notes, thread: 'team', keep: 10, after: 10, shrink: 'summary', model: embedder },
  voice: { hear: embedder, speak: embedder, name: 'calm', language: 'en', whole: true },
  trust: [nightly],
  knows: ['caller', 'time'],
  together: { max: 2, then: 'refuse' },
  words: { refused: 'The person said no.' },
  driver: 'planner',
  policy: { read: ['tables/*'], mode: 'propose' },
  reasoning: { show: true, save: true },
  tell: 'list',
  sequence: true,
  countBy: 'caller',
  pace: { debounce: '1 minute' },
  was: 'aide',
})
