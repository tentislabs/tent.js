import { model, secret } from 'tentjs'

export const other = model('other', { provider: 'anthropic', name: 'claude-opus-5-5', key: secret('ANTHROPIC_KEY') })

export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('ANTHROPIC_KEY'), fallback: [other] })
