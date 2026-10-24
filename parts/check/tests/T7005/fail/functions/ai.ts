import { model, secret } from 'tentjs'

export const reader = model('reader', { provider: 'openai-style', name: 'tiny', url: 'http://127.0.0.1:1/v1', abilities: ['reply'], takes: 4000 })

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY'), fallback: [reader] })
