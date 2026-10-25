import { seed } from 'tentjs'

// Past tickets, each with what the customer wrote and what the desk answered, where it answered.
const PAST = [
  {
    customer: 'ada',
    subject: 'My parcel is late',
    status: 'closed',
    order: 'ord_1042',
    asked: 'Order ord_1042 has not come yet. Where is it?',
    answered: 'It left our store on Monday and comes on Thursday.',
  },
  {
    customer: 'grace',
    subject: 'An invoice for my company',
    status: 'answered',
    asked: 'Can I have an invoice with the name of my company?',
    answered: 'Yes: write the name under Account, and every invoice holds it.',
  },
  {
    customer: 'alan',
    subject: 'Two charges for one order',
    status: 'open',
    order: 'ord_1077',
    asked: 'My card shows two charges for order ord_1077. Can you look?',
  },
  {
    customer: 'grace',
    subject: 'How do I change my email?',
    status: 'closed',
    asked: 'I have a new email address. How do I change it?',
    answered: 'Open Account and write the new address under Email.',
  },
  {
    customer: 'ada',
    subject: 'The wrong size came',
    status: 'answered',
    order: 'ord_1101',
    asked: 'I ordered a medium and a large came. What now?',
    answered: 'We are sending a medium today; keep the large until it comes.',
  },
  {
    customer: 'alan',
    subject: 'Can I order by phone?',
    status: 'open',
    asked: 'Is there a number I can call to order?',
  },
] as const

export default seed(({ db }) => {
  db.users.add({ email: 'sam@desk.example', name: 'Sam', roles: ['staff'] })
  const ada = db.users.add({ email: 'ada@desk.example', name: 'Ada Lovelace', roles: [] })
  const customers = {
    ada: db.customers.add({ name: 'Ada Lovelace', email: 'ada@desk.example', tier: 'gold', user: ada.id }),
    grace: db.customers.add({ name: 'Grace Hopper', email: 'grace@desk.example' }),
    alan: db.customers.add({ name: 'Alan Turing', email: 'alan@desk.example' }),
  }
  for (const past of PAST) {
    const ticket = db.tickets.add({
      subject: past.subject,
      customer: customers[past.customer].id,
      status: past.status,
      ...('order' in past ? { order: past.order } : {}),
    })
    db.messages.add({ who: 'user', text: past.asked, ticket: ticket.id })
    if ('answered' in past) db.messages.add({ who: 'assistant', text: past.answered, ticket: ticket.id })
  }
})
