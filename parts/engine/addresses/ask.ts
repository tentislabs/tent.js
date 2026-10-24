import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { countedHere, formOf, personOf, programsAt } from '../grants/door.ts'
import { limitOf } from '../limits.ts'
import { answeredOnPage, waitingAt } from '../mcp/asked.ts'
import { askLife, askPage } from '../mcp/askPage.ts'
import { readText, spendOnce } from '../mcp/texts.ts'
import { errorAnswer, okAnswer } from '../wire.ts'

const notFound = (): TentError =>
  new TentError('T0001', 'No call waits here for this person.', {
    fix: 'Open the address that the program was answered with, signed in as the person it acts for.',
  })

/**
 * `GET /_t/ask?a=<text>` and `POST /_t/ask`: the page where the signed-in person, who must be the user of the
 * caller, agrees to one call of a program that asks a person, and their yes or no, with a text of the engine's own
 * that works once. A yes lets the next such call of that caller, with that input, run once. A look grants nothing.
 * It passes steps 1 to 4 of the door, counted like a request for a screen, and a key and a token are nobody here.
 */
export const address: Address = {
  order: 1,
  match: (request) => programsAt(request, '/_t/ask') && { name: 'ask' },
  steps: [1, 2, 3],
  async handle({ app: o, request, caller, about }) {
    try {
      countedHere(o, about.from)
      const person = personOf(caller)
      if (request.method === 'GET') {
        const text = new URL(request.url).searchParams.get('a') ?? ''
        const waiting = waitingAt(o, text)
        if (!waiting || person === undefined || waiting.user !== person) throw notFound()
        return await askPage(o, { text, waiting, caller, request, origin: about.origin })
      }
      if (request.method !== 'POST') throw notFound()
      const form = await formOf(request, limitOf(o.description, 'callSize'))
      const answer = form.get('t') ?? ''
      const held = readText(o, 'ask', answer, askLife(o))
      const text = typeof held?.a === 'string' ? held.a : ''
      const waiting = waitingAt(o, text)
      if (!held || !waiting || person === undefined || held.user !== person || !spendOnce(o, answer, askLife(o)))
        throw new TentError(
          'T0002',
          'This answer agrees to nothing: it was sent by another person, a second time, or too late.',
          { fix: 'Open the page of the call again, from the address the program was answered with.' },
        )
      answeredOnPage(o, text, form.get('answer') === 'allow' ? 'allow' : 'refuse')
      // The page code loads the page of the call again, which says that it was answered; a form is shown it at once.
      if ((request.headers.get('accept') ?? '').includes('application/json'))
        return okAnswer({ to: `/_t/ask?a=${encodeURIComponent(text)}` })
      return await askPage(o, { text, waiting, caller, request, origin: about.origin })
    } catch (error) {
      return errorAnswer(o, 'ask', error)
    }
  },
}
