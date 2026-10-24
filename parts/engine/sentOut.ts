import type { CallContext } from './context.ts'
import type { Opened } from './opened.ts'
import { spanned } from './trace/span.ts'

/**
 * Takes an app, the call that sends, what it is (`mail`, with `send`), and the work that sends. Carries
 * the work out as a span of its own, `<service>.<call>`, whose row of the calls out names the run it was made in:
 * so what a run sent out of the app stays named in its trace, for an undo to say. Answers what the work answers,
 * and throws what it throws.
 */
export async function sentOut<Answer>(
  o: Opened,
  cx: CallContext,
  what: { service: string; call: string },
  work: () => Promise<Answer>,
): Promise<Answer> {
  const began = o.clock.now()
  let status = 500
  return spanned(o, { name: `${what.service}.${what.call}`, kind: 'service' }, async () => {
    try {
      const answer = await work()
      status = 200
      return answer
    } finally {
      const run = cx.run?.id
      o.log.write('outgoing', {
        at: o.clock.now(),
        service: what.service,
        call: what.call,
        status,
        ms: o.clock.now() - began,
        ...(run ? { run } : {}),
      })
    }
  })
}
