import { action, agent, file, files, flow, list, model, secret, table, text } from 'tentjs'

export const users = table('users', {
  columns: { name: text({ optional: true }), roles: list(text()) },
  access: { read: 'owner' },
})

const key = secret('OPENAI_KEY')

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY') })
export const listener = model('listener', { provider: 'openai', name: 'whisper-1', key })
export const speaker = model('speaker', { provider: 'openai', name: 'tts-1', key })

// Keeps the bytes the test hands as a recording of the caller's own, and answers its id.
export const keepSound = action('keepSound', {
  access: 'signedIn',
  input: { base64: text() },
  output: text(),
  run: async ({ input }) => files.put(Buffer.from(input.base64, 'base64'), { name: 'said.wav', kind: 'audio/wav' }),
})

const limits = { steps: 4, perRun: { calls: 20 } }

export const talker = agent('talker', {
  model: writer,
  instructions: 'You talk.',
  tools: [],
  access: 'signedIn',
  voice: { hear: listener, speak: speaker, name: 'nova', language: 'en' },
  limits,
})

// An agent that has no voice: a start with a recording is refused.
export const mute = agent('mute', {
  model: writer,
  instructions: 'You write.',
  tools: [],
  access: 'signedIn',
  limits,
})

// A flow that hears and speaks, each inside a step.
export const voiceFlow = flow('voiceFlow', {
  access: 'signedIn',
  as: 'starter',
  input: { audio: file() },
  output: text(),
  run: async ({ input, step }) => {
    const heard = await step('hear', () => listener.hear(input.audio))
    const sound = await step('speak', () => speaker.speak(`Back: ${heard.text}`))
    return `${heard.text} ${typeof sound === 'string' ? 'and a sound' : 'and nothing'}`
  },
})
