import { caller, change, choice, given, input, link, lower, query, role, start, text, trim, vector } from 'tentjs'
import { messages } from '../tables/messages'
import { tickets } from '../tables/tickets'
import { mailAnswer } from './mail'

const shown = ['id', 'subject', 'status', 'order', 'customer', 'createdAt', 'updatedAt'] as const

export const ticketList = query('ticketList', {
  about: 'The tickets of the help desk, newest first, of one status or of every status',
  access: role('staff'),
  offer: ['api', 'mcp', 'cli'],
  input: { status: choice(['open', 'answered', 'closed'], { optional: true }) },
  rows: tickets
    .where({ status: given(input('status')) })
    .pick([...shown])
    .with('customer')
    .newest('createdAt')
    .limit(200),
})

export const getTicket = query('getTicket', {
  about: 'One ticket of the help desk, with its customer',
  access: role('staff'),
  offer: ['api', 'mcp', 'cli'],
  input: { id: link('tickets') },
  rows: tickets
    .get(input('id'))
    .pick([...shown])
    .with('customer'),
})

export const ticketMessages = query('ticketMessages', {
  about: 'The conversation of one ticket, oldest first',
  access: role('staff'),
  input: { ticket: link('tickets') },
  rows: messages
    .where({ ticket: input('ticket'), who: { in: ['user', 'assistant'] } })
    .oldest('createdAt')
    .limit(500),
})

export const myTickets = query('myTickets', {
  about: 'The tickets of the customer who asks',
  access: 'signedIn',
  system: 'a customer reads the tickets of their own customer row, which only staff read',
  rows: tickets
    .where({ 'customer.user': caller('id') })
    .pick([...shown])
    .newest('createdAt')
    .limit(100),
})

export const addTicket = change('addTicket', {
  about: 'Adds the ticket of a mail, with its customer where they are new and its first message',
  access: 'nobody',
  input: {
    from: text({ max: 254 }),
    name: text({ optional: true, max: 200 }),
    subject: text({ min: 1, max: 300 }),
    text: text({ lines: 'many', max: 100000 }),
    meaning: vector({ size: 1536 }),
  },
  run: ({ input, db }) => {
    const email = lower(trim(input.from))
    const known = db.customers.where({ email }).first()
    const customer = known ?? db.customers.add({ name: input.name ?? email, email })
    const ticket = db.tickets.add({ subject: input.subject, customer: customer.id, meaning: input.meaning })
    db.messages.add({ who: 'user', text: input.text, ticket: ticket.id })
    return { ticket: ticket.id }
  },
})

export const answerTicket = change('answerTicket', {
  about: 'Answers a ticket: the answer joins its conversation and is mailed to the customer',
  access: role('staff'),
  system: 'the conversation of a ticket is the memory of the assistant, which no rule lets a caller write',
  input: { ticket: link('tickets'), text: text({ min: 1, lines: 'many', max: 100000 }) },
  run: ({ input, db }) => {
    db.tickets.change(input.ticket, { status: 'answered' })
    db.system.messages.add({ who: 'assistant', text: input.text, ticket: input.ticket })
    start(mailAnswer, { ticket: input.ticket, text: input.text })
  },
})

export const closeTicket = change('closeTicket', {
  about: 'Closes a ticket',
  access: role('staff'),
  input: { ticket: link('tickets') },
  set: tickets.change(input('ticket'), { status: 'closed' }),
})
