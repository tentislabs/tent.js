import { date, flow, list, number, object, text } from 'tentjs'
import { calendar } from '../services/tools'

export const sendInvite = flow('sendInvite', {
  about: 'Sends an invitation to a call through the calendar',
  access: 'signedIn',
  as: 'starter',
  danger: 'ask',
  input: {
    title: text({ min: 1, max: 200 }),
    with: list(text({ max: 254 }), { min: 1, max: 50 }),
    at: date(),
    minutes: number({ min: 5, max: 600, whole: true, default: 30 }),
  },
  output: object({ sent: text() }),
  run: async ({ input, step }) => {
    const made = await step('send', () =>
      calendar.createEvent({
        title: input.title,
        with: input.with,
        at: input.at.toISOString(),
        minutes: input.minutes,
      }),
    )
    return { sent: String(Object(made).id ?? 'sent') }
  },
})
