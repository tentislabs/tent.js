import { model, secret } from 'tentjs'

export const backup = model('backup', { provider: 'openai', name: 'gpt-5-mini', key: secret('OPENAI_KEY') })

export const writer = model('writer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  // A staff member waits on the draft: one more try, a second later, and then the backup answers.
  tries: { max: 2, wait: '1 second' },
  fallback: [backup],
})

export const embedder = model('embedder', {
  provider: 'openai',
  name: 'text-embedding-3-small',
  key: secret('OPENAI_KEY'),
})

export const listener = model('listener', { provider: 'openai', name: 'gpt-4o-transcribe', key: secret('OPENAI_KEY') })

export const speaker = model('speaker', { provider: 'openai', name: 'gpt-4o-mini-tts', key: secret('OPENAI_KEY') })
