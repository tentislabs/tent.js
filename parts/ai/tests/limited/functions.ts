import { action, agent, json, list, model, number, query, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })

export const lookUp = query('lookUp', {
  about: 'Looks a word up',
  access: 'signedIn',
  input: { word: text({ optional: true }) },
  run: ({ input }) => `found ${input.word ?? 'nothing'}`,
})

// A tool that takes its time, and says how many of its calls work at once.
let working = 0
let most = 0
export const slowly = action('slowly', {
  about: 'Works slowly',
  access: 'signedIn',
  input: { n: number() },
  output: json(),
  sends: false,
  run: async ({ input }) => {
    working++
    most = Math.max(most, working)
    await new Promise((done) => setTimeout(done, 40))
    working--
    return { n: input.n, most }
  },
})

const tools = [lookUp, slowly]
const base = { model: writer, instructions: 'You help.', tools, access: 'signedIn' as const }

export const stepper = agent('stepper', { ...base, limits: { steps: 2, perRun: { tokensOut: 1000000 } } })

// An agent that states no limits: how far its run goes is the builder's.
export const unlimited = agent('unlimited', base)

export const budget = agent('budget', { ...base, limits: { steps: 20, perRun: { tokensOut: 10 } } })

export const twoUnits = agent('twoUnits', { ...base, limits: { steps: 20, perRun: { tokensOut: 1000, tokensIn: 100 } } })

export const threeCalls = agent('threeCalls', { ...base, limits: { steps: 20, perRun: { calls: 3 } } })

export const fewTools = agent('fewTools', { ...base, limits: { steps: 20, perRun: { calls: 100 }, toolCalls: 2 } })

export const oneAtOnce = agent('oneAtOnce', { ...base, limits: { steps: 20, perRun: { calls: 100 }, toolsAtOnce: 1 } })

export const loop = agent('loop', { ...base, limits: { steps: 100, perRun: { tokensOut: 25 } } })

export const short = agent('short', { ...base, limits: { steps: 20, perRun: { calls: 100 }, time: '1 ms' } })

export const lonely = agent('lonely', {
  ...base,
  together: { max: 1 },
  limits: { steps: 20, perRun: { calls: 100 } },
})
