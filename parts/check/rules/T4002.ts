import { callsIn } from '../code.ts'
import type { Rule } from '../rule.ts'
import { arrowOf, at, inside, writtenIn } from '../rule.ts'

const draws =
  /^(?:Math\.random|crypto\.(?:randomUUID|getRandomValues|randomBytes|randomInt)|randomUUID|randomBytes|randomInt|random|token)$/

/** A query draws a random number: in its code, in `rows:` and in a `run` that was read alike. */
export const rule: Rule = {
  code: 'T4002',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'query')
      .flatMap((query) => {
        const say = (word: string, node?: Parameters<typeof at>[2]) =>
          at(
            'T4002',
            query,
            node,
            `the query draws a random value, \`${word}\`. A query answers the same for the same data.`,
            'Draw the value in a change or in an action, and hand it to the query as an input.',
          )
        const stored = description.functions[query.name]
        const drawn: string[] = []
        // A stored plan and a stored body hold a word that is drawn by its name.
        inside([stored?.plan, stored?.body], (record) => {
          if (record.random === true) drawn.push('random()')
          if (record.fn === 'random' || record.fn === 'token') drawn.push(`${record.fn}()`)
        })
        if (drawn.length) return drawn.map((word) => say(word))
        const run = stored?.form === 'code' ? arrowOf(query, 'run') : undefined
        return (run ? callsIn(run) : [])
          .filter((call) => draws.test(call.name))
          .map((call) => say(call.name, call.node))
      }),
}
