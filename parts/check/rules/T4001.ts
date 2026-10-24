import { callsIn } from '../code.ts'
import type { Rule } from '../rule.ts'
import { arrowOf, at, writtenIn } from '../rule.ts'

const clocks = new Set(['Date.now', 'performance.now', 'process.hrtime', 'process.hrtime.bigint', 'process.uptime'])

/** A query reads a clock other than the `now` it is handed. */
export const rule: Rule = {
  code: 'T4001',
  needs: ['source'],
  reads: 'file',
  run: ({ source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'query')
      .flatMap((query) => {
        const run = arrowOf(query, 'run')
        return (run ? callsIn(run) : [])
          .filter((call) => clocks.has(call.name) || (call.name === 'Date' && !call.args.length))
          .map((call) =>
            at(
              'T4001',
              query,
              call.node,
              `the query reads a clock, \`${call.name}\`. A query answers the same for the same data, so the one moment it may read is \`now\`.`,
              'Read `now`, which `run` is handed, or the word `now()`.',
            ),
          )
      }),
}
