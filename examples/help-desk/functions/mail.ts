import { flow, link, text, concat } from 'tentjs'
import { mailService } from '../services/services'

export const mailAnswer = flow('mailAnswer', {
  about: 'Mails the answer of a ticket to its customer',
  input: { ticket: link('tickets'), text: text() },
  run: async ({ input, step, db }) => {
    const ticket = await db.tickets.where({ id: input.ticket }).with('customer').first()
    if (!ticket) return
    await step('send', () =>
      mailService.send({ to: ticket.customer.email, subject: concat('Re: ', ticket.subject), text: input.text }),
    )
  },
})
