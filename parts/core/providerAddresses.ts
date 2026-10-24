/**
 * Where each provider that ships is reached, by the name a model gives in `provider`: the one place of these
 * addresses, which the providers call. `openai-style` has none: a model of it states its own `url`.
 */
export const providerAddresses: Readonly<Record<string, string>> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  google: 'https://generativelanguage.googleapis.com',
}
