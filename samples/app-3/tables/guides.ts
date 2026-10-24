import { file, link, number, role, table, text, vector } from 'tentjs'
import { embedder } from '../models/models'

export const guides = table('guides', {
  columns: {
    title: text({ min: 1, max: 200 }),
    file: file({ kinds: ['application/pdf'], maxSize: '20 MB' }),
  },
  access: { read: 'signedIn', add: role('staff') },
})

export const guideChunks = table('guideChunks', {
  columns: {
    guide: link('guides', { onRemove: 'remove' }),
    text: text({ lines: 'many' }),
    page: number({ whole: true, min: 1 }),
    meaning: vector({ size: 1536, model: embedder }),
  },
  access: { read: 'signedIn', add: role('staff') },
})
