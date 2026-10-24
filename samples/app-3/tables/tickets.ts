import { choice, link, role, table, text, vector } from 'tentjs'
import { embedder } from '../models/models'

export const tickets = table('tickets', {
  columns: {
    subject: text({ min: 1, max: 300 }),
    customer: link('customers'),
    status: choice(['open', 'answered', 'closed'], { default: 'open' }),
    order: text({ optional: true, max: 100 }),
    meaning: vector({ size: 1536, model: embedder }),
  },
  access: { read: role('staff'), add: role('staff'), change: role('staff') },
})
