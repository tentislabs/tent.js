import { model } from 'tentjs'

// The two Claude models that Claude Code is told to use. Claude Code itself calls them, on the person's own sign-in;
// the driver books what each turn used, and these limits bound a day of it above the person's own limit.
export const thinker = model('thinker', {
  provider: 'claudeCode',
  name: 'opus',
  abilities: ['reply', 'tools'],
  takes: 1000000,
  limits: { perCallerPerDay: { tokensOut: 5000000 }, time: '10 minutes' },
})

export const quick = model('quick', {
  provider: 'claudeCode',
  name: 'haiku',
  abilities: ['reply', 'tools'],
  takes: 200000,
  limits: { perCallerPerDay: { tokensOut: 5000000 }, time: '10 minutes' },
})
