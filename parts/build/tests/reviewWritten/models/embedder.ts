import { model } from 'tentjs'

export const embedder = model('embedder', { provider: 'openai', name: 'text-embedding-3-small', abilities: ['embed'] })
