import {
  change,
  chunks,
  each,
  file,
  files,
  flow,
  input,
  link,
  list,
  number,
  object,
  query,
  role,
  text,
  vector,
} from 'tentjs'
import { embedder } from '../models/models'
import { guideChunks, guides } from '../tables/guides'

export const guideList = query('guideList', {
  about: 'The guides of the help desk, newest first',
  access: 'signedIn',
  rows: guides.where({}).pick(['id', 'title', 'file', 'createdAt']).newest('createdAt').limit(100),
})

export const addGuide = change('addGuide', {
  about: 'Adds a guide, a PDF file, which is then read and cut into pieces',
  access: role('staff'),
  input: { title: text({ min: 1, max: 200 }), file: file({ kinds: ['application/pdf'], maxSize: '20 MB' }) },
  set: guides.add({ title: input('title'), file: input('file') }),
})

export const addPiece = change('addPiece', {
  about: 'Keeps one piece of a guide with its meaning',
  access: 'nobody',
  input: {
    guide: link('guides'),
    text: text({ lines: 'many' }),
    page: number({ whole: true, min: 1 }),
    meaning: vector({ size: 1536 }),
  },
  set: guideChunks.add({ guide: input('guide'), text: input('text'), page: input('page'), meaning: input('meaning') }),
})

export const readGuide = flow('readGuide', {
  about: 'Reads a guide that was added, cuts it into pieces and keeps each with its meaning',
  on: guides.added(),
  run: async ({ event, step }) => {
    const words = await step('read', () => files.text(event.row.file))
    const cut = chunks(words, { size: 1200, overlap: 150 })
    const meanings = await step('embed', () => embedder.embed(each(cut, (piece) => piece.text)))
    await step.all(cut, (piece, i) =>
      step('keep', () =>
        addPiece({ guide: event.row.id, text: piece.text, page: piece.page ?? 1, meaning: meanings[i] ?? [] }),
      ),
    )
  },
})

const found = object({ guide: text(), title: text(), page: number(), text: text() })

export const findInGuide = flow('findInGuide', {
  about: 'Finds the pieces of the guide that answer a question, each with the title of its guide and its page',
  as: 'starter',
  access: 'signedIn',
  input: { question: text({ min: 1, max: 1000 }) },
  output: list(found),
  run: async ({ input, step, db }) => {
    const meaning = await step('embed', () => embedder.embed(input.question))
    const near = await db.guideChunks.near('meaning', meaning).with('guide').limit(4).all()
    return each(near, (piece) => ({
      guide: piece.guide.id,
      title: piece.guide.title,
      page: piece.page,
      text: piece.text,
    }))
  },
})

export const findInTickets = flow('findInTickets', {
  about: 'Finds the past tickets nearest by meaning to a question, each with its subject and its status',
  as: 'starter',
  input: { question: text({ min: 1, max: 1000 }) },
  output: list(object({ ticket: text(), subject: text(), status: text() })),
  run: async ({ input, step, db }) => {
    const meaning = await step('embed', () => embedder.embed(input.question))
    const near = await db.tickets.near('meaning', meaning).limit(5).all()
    return each(near, (ticket) => ({ ticket: ticket.id, subject: ticket.subject, status: ticket.status }))
  },
})
