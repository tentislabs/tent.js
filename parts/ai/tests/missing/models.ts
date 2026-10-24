import { model } from 'tentjs'

// A provider that neither ships nor is made in `engine.ts`.
export const writer = model('writer', { provider: 'nowhere', name: 'w-1', abilities: ['reply'], takes: 1000 })
