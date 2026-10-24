import { agent, model, secret } from 'tentjs'
import { messages } from '../tables/tables'

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

// Every project tool, as the policies of these tests name them.
const every = [
  'map',
  'read',
  'search',
  'docs',
  'edit',
  'write',
  'rename',
  'remove',
  'check',
  'run',
  'rows',
  'logs',
  'shot',
  'history',
  'compare',
  'changedBy',
]

const base = {
  model: writer,
  instructions: 'You build the app of the person, in plain definitions.',
  tools: [],
  access: 'signedIn' as const,
  memory: { in: messages, thread: 'project' },
  limits: { steps: 40, perRun: { tokensOut: 100000 } },
}

// The agent that builds: it may do every thing of one definition, and reach one outside host.
export const builder = agent('builder', {
  ...base,
  policy: {
    read: ['*'],
    edit: ['*'],
    create: ['*'],
    remove: ['*'],
    tools: every,
    reaches: ['api.example.com'],
  },
})

// One that may change screens and tables and add screens alone, removes nothing, and asks before a rename.
export const narrow = agent('narrow', {
  ...base,
  policy: {
    read: ['*'],
    edit: ['screen', 'table'],
    create: ['screen'],
    remove: [],
    tools: every,
    ask: ['rename'],
  },
})

// One that may remove, after the person's yes.
export const asker = agent('asker', {
  ...base,
  policy: { read: ['*'], edit: ['*'], create: ['*'], remove: ['*'], tools: every, ask: ['remove'] },
})

// One that may run a function of the workspace as the system.
export const runner = agent('runner', {
  ...base,
  policy: { read: ['*'], tools: ['run', 'rows', 'logs'], also: ['runAsSystem'] },
})

// One that shows what it would do, and one that only talks.
export const proposer = agent('proposer', {
  ...base,
  policy: { read: ['*'], edit: ['*'], create: ['*'], remove: ['*'], tools: every, mode: 'propose' },
})

export const frozen = agent('frozen', {
  ...base,
  policy: { read: ['*'], edit: ['*'], create: ['*'], remove: ['*'], tools: every, mode: 'frozen' },
})

// One that reads tables alone.
export const reader = agent('reader', {
  ...base,
  policy: { read: ['table'], tools: ['read', 'search', 'history'] },
})

// One that may write `engine.ts` too.
export const coder = agent('coder', {
  ...base,
  policy: { read: ['*'], edit: ['*'], create: ['*'], remove: ['*'], tools: every, also: ['engine'] },
})

// One that may touch screens and files that hold no definition, and nothing else.
export const filer = agent('filer', {
  ...base,
  policy: { read: ['*'], edit: ['screen', 'file'], create: ['screen', 'file'], remove: [], tools: every },
})

// One that may edit anything, each edit after the person's yes.
export const editAsker = agent('editAsker', {
  ...base,
  policy: { read: ['*'], edit: ['*'], create: ['*'], remove: ['*'], tools: every, ask: ['edit'] },
})

// One whose every run of a function waits for the person.
export const runAsker = agent('runAsker', {
  ...base,
  policy: { read: ['*'], tools: ['run', 'rows'], ask: ['run'] },
})
