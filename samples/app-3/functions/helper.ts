import { agent } from 'tentjs'
import { listener, speaker, writer } from '../models/models'
import { messages } from '../tables/messages'
import { findInGuide, findInTickets } from './guides'
import { lookUpOrder, refundOrder } from './orders'

export const researcher = agent('researcher', {
  about: 'Reads the guide closely for a question and answers with what it says, naming each page',
  model: writer,
  instructions:
    'You read the guide of the help desk for one question. Search it with findInGuide, and answer only with what the guide says, naming the guide and the page of each part you use.',
  tools: [findInGuide],
  limits: { steps: 6, perRun: { tokensOut: 20000 }, time: '2 minutes' },
})

export const helper = agent('helper', {
  about: 'Drafts answers of tickets from past tickets and the guide, and answers customers who ask out loud',
  model: writer,
  instructions: [
    'You help the staff of a help desk answer tickets, and customers who ask a question.',
    'Draft answers from the guide, with findInGuide or researcher, and from past tickets, with findInTickets.',
    'Name the guide and the page of each part of the guide you use, as "(guide title, page 2)".',
    'Look an order up with lookUpOrder before you speak of it. Refund an order only with refundOrder, which asks the person first.',
  ].join(' '),
  tools: [findInGuide, findInTickets, lookUpOrder, refundOrder, researcher],
  access: 'signedIn',
  memory: { in: messages, thread: 'ticket', keep: 40 },
  voice: { hear: listener, speak: speaker, language: 'en' },
  limits: { steps: 12, perRun: { tokensOut: 50000 }, time: '5 minutes', ask: '1 day' },
})
