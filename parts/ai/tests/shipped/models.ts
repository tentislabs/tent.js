import { model, secret } from 'tentjs'

// The test writes this file again for each provider, with the address of its server.
export const writer = model('writer', { provider: 'anthropic', name: 'claude-sonnet-5-5', key: secret('KEY') })
