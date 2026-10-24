import {
  action,
  agent,
  boolean,
  fail,
  input,
  judge,
  model,
  noOtherPeople,
  noPersonal,
  object,
  query,
  runs,
  secret,
  text,
} from 'tentjs'
import { customers, messages, notes, orders } from './tables'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const myOrders = query('myOrders', {
  about: 'The orders of the person asking',
  access: 'signedIn',
  input: {},
  rows: orders.where({}),
})

export const myCustomers = query('myCustomers', {
  about: 'The customers that the person asking keeps',
  access: 'signedIn',
  input: {},
  rows: customers.where({}),
})

export const teamNotes = query('teamNotes', {
  about: 'The notes of a team that the person asking wrote',
  access: 'signedIn',
  input: { team: text() },
  rows: notes.of(input('team')).where({}),
})

// Code that reads what someone outside wrote: its answer is text from outside the app. The test writes the
// address of its stand-in host in place of this one. It reaches the outside, so its agent trusts it.
export const news = action('news', {
  about: 'The news of the day',
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => (await fetch('http://127.0.0.1:1/news')).text(),
})

// Code that reads what someone outside wrote, and fails with it: its error is text from outside too.
export const weather = action('weather', {
  about: 'The weather of the day',
  access: 'signedIn',
  input: {},
  output: text(),
  run: async () => fail('no-weather', await (await fetch('http://127.0.0.1:1/weather')).text()),
})

export const tone = action('tone', {
  about: 'Holds a text to the tone of the shop',
  access: 'signedIn',
  input: { text: text({ lines: 'many' }), from: text() },
  output: object({ pass: boolean(), why: text({ optional: true }) }),
  sends: false,
  run: async ({ input: given }) =>
    given.text.includes('forbidden') ? { pass: false, why: `a forbidden word, from ${given.from}` } : { pass: true },
})

const guarded = { in: [tone], out: [tone], refused: 'Not here.' }

// Told its tools as a list: the answer of a tool it calls by name still came from outside.
export const listing = agent('listing', {
  about: 'Reads the news from a list',
  model: writer,
  instructions: 'Read the news.',
  tools: [news],
  trust: [news],
  tell: 'list',
  access: 'signedIn',
  guards: guarded,
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

export const forecaster = agent('forecaster', {
  about: 'Tells the weather',
  model: writer,
  instructions: 'Tell the weather.',
  tools: [weather],
  trust: [weather],
  access: 'signedIn',
  guards: guarded,
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

export const billing = agent('billing', {
  about: 'Answers of bills',
  model: writer,
  instructions: 'You are billing.',
  tools: [],
  access: 'signedIn',
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

// No `access`: through the door it is not found, so a person never starts it.
export const backOffice = agent('backOffice', {
  about: 'Works for code alone',
  model: writer,
  instructions: 'You are backOffice.',
  tools: [],
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

export const front = agent('front', {
  about: 'Answers first',
  model: writer,
  instructions: 'You are front.',
  tools: [myOrders],
  access: 'signedIn',
  handsOver: [billing, backOffice],
  guards: guarded,
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

export const sorter = agent('sorter', {
  about: 'Sorts a message',
  model: writer,
  instructions: 'Sort it.',
  tools: [],
  access: 'signedIn',
  output: object({ kind: text() }),
  guards: guarded,
  memory: { in: messages, thread: 'chat' },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

export const asker = agent('asker', {
  about: 'Asks before it answers',
  model: writer,
  instructions: 'Ask what you need to know.',
  tools: [],
  access: 'signedIn',
  questions: true,
  guards: { out: [tone, noOtherPeople] },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

export const discreet = agent('discreet', {
  about: 'Answers of the customers and the notes of the person asking',
  model: writer,
  instructions: 'Answer of the customers and the notes.',
  tools: [myCustomers, teamNotes],
  access: 'signedIn',
  guards: { out: [noOtherPeople, noPersonal] },
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})

// Backend code that answers a step of a run with a value: a question is the starter's to answer alone.
export const answerFor = action('answerFor', {
  access: 'signedIn',
  system: 'it answers a step that waits, as a mail would',
  input: { run: text(), step: text(), value: text() },
  run: async ({ input: given }) => {
    await runs.approve(given.run, given.step, { value: given.value })
  },
})

export const picker = agent('picker', {
  about: 'Picks an order',
  model: writer,
  instructions: 'Pick one order.',
  tools: [myOrders],
  access: 'signedIn',
  output: object({ order: text() }),
  guards: { out: [noOtherPeople] },
  limits: { steps: 6, perRun: { tokensOut: 50000 } },
})

// Every run is scored, and a run may make one model call: the score is on a budget of its own.
export const scoredDesk = agent('scoredDesk', {
  about: 'Answers, and each answer is scored',
  model: writer,
  instructions: 'Answer briefly.',
  tools: [],
  access: 'signedIn',
  score: { share: 1, with: judge(writer, 'Answers kindly') },
  limits: { steps: 4, perRun: { calls: 1 } },
})

export const quiet = agent('quiet', {
  about: 'Answers briefly',
  model: writer,
  instructions: 'Answer briefly.',
  tools: [],
  access: 'signedIn',
  limits: { steps: 4, perRun: { tokensOut: 50000 } },
})
