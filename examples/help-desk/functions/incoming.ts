import { flow, incoming, log, concat } from 'tentjs'
import { readMail } from '../lib/mail'
import { embedder } from '../models/models'
import { mailService } from '../services/services'
import { addTicket } from './tickets'

export const openTicket = flow('openTicket', {
  about: 'Opens a ticket for a mail that reached the support address',
  run: async ({ event, step }) => {
    // The body of a call is any JSON value, so its fields are read by a guard.
    const mail = readMail(event?.body)
    if (!mail) return log.warn('a call of the mail hook held no mail')
    const meaning = await step('embed', () => embedder.embed(concat(mail.subject, '\n', mail.text)))
    await step('add', () =>
      addTicket({ from: mail.from, name: mail.name, subject: mail.subject, text: mail.text, meaning }),
    )
  },
})

export const mailReceived = incoming('mailReceived', {
  path: '/hooks/mail',
  verify: mailService.signature,
  then: openTicket,
})
