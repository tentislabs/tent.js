import { model, secret } from 'tentjs'

export const writer = model('writer', {
  provider: 'anthropic',                 // 'openai' | 'openai-style' | 'google', or a provider of your own
  name: 'claude-sonnet-5-5',
  key: secret('ANTHROPIC_KEY'),
  url: undefined,                        // required for 'openai-style'
  abilities: undefined,                  // for a model the list does not know: 'reply', 'tools', 'typedAnswers', 'images', ...
  limits: { perDay: { tokensOut: 1000000 } },
  options: {},                           // passed straight to the provider
  // fallback: [backup]                           a second provider - 26-models.md
  // input: {...}, output: ...                     any other kind of AI, called as a function - 26-models.md
})
