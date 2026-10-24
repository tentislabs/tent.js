import { model, secret } from 'tentjs'

export const writer = model('writer', {
  provider: 'anthropic',
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
})
