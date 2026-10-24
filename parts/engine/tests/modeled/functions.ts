import { model } from 'tentjs'

const writes = { abilities: ['reply'], takes: 100_000 }

// Two models of providers that the test stands in for: the one that is asked, and the one it falls back to.
export const backup = model('backup', { provider: 'second', name: 'b-1', ...writes })

export const writer = model('writer', { provider: 'first', name: 'w-1', ...writes, fallback: [backup] })

// The same two, each with a limit on its calls.
export const helper = model('helper', { provider: 'second', name: 'h-1', ...writes, limits: { perDay: { calls: 1 } } })

export const asker = model('asker', {
  provider: 'first',
  name: 'a-1',
  ...writes,
  fallback: [helper],
  limits: { perDay: { calls: 2 } },
})

// A provider that reports a unit of its own, and a limit on it.
export const pictures = model('pictures', { provider: 'pics', name: 'p-1', ...writes, limits: { perDay: { images: 3 } } })

// A limit on the calls of each caller.
export const chatty = model('chatty', { provider: 'second', name: 'c-1', ...writes, limits: { perCallerPerDay: { calls: 1 } } })

// A provider that reports nothing, which the rule counts, and a limit on what it wrote.
export const quiet = model('quiet', { provider: 'quiet', name: 'q-1', ...writes, limits: { perDay: { tokensOut: 5 } } })

// A provider that reports a unit under a name of the engine's own.
export const bytes = model('bytes', { provider: 'bytes', name: 'y-1', ...writes })
