import { boolean, text } from '../../core/index.ts'
import type { Command } from '../command.ts'
import { withText } from '../print.ts'
import { operatedAt } from '../operated.ts'
import { traceText } from '../traceText.ts'
import { vitalsText } from '../vitalsText.ts'

/**
 * Prints the newest calls, errors and slow queries of the log: with `--errors` the errors alone, with `--mail` the
 * messages the app sent in development, with `--trace <id>` the tree of one trace, with `--slow` the slowest traces
 * beside the slow queries, with `--vitals` the speed visitors saw of each screen, and with `--since` what was
 * written within that length of time.
 */
export const command: Command = {
  name: 'logs',
  args: {
    errors: boolean({ optional: true }),
    mail: boolean({ optional: true }),
    trace: text({ optional: true }),
    slow: boolean({ optional: true }),
    vitals: boolean({ optional: true }),
    since: text({ optional: true }),
    data: text({ optional: true }),
    at: text({ optional: true }),
    insecure: text({ optional: true }),
  },
  needs: 'engine',
  run: async ({ args, folder }) => {
    const answered = await operatedAt({ folder, data: args.data, at: args.at, insecure: args.insecure }, 'logs', {
      ...(args.errors === true ? { errors: true } : {}),
      ...(args.mail === true ? { mail: true } : {}),
      ...(typeof args.trace === 'string' ? { trace: args.trace } : {}),
      ...(args.slow === true ? { slow: true } : {}),
      ...(args.vitals === true ? { vitals: true } : {}),
      ...(typeof args.since === 'string' ? { since: args.since } : {}),
    })
    const value: unknown = answered.value
    const ranked: unknown = Reflect.get(Object(value), 'vitals')
    if (args.vitals === true && Array.isArray(ranked))
      return { ...answered, value: withText({ vitals: ranked }, vitalsText(ranked)) }
    const spans: unknown = Reflect.get(Object(value), 'spans')
    // A trace is printed as its tree, a span on a line; with `--json` it is the record.
    if (typeof args.trace !== 'string' || typeof value !== 'object' || value === null || !Array.isArray(spans))
      return answered
    return { ...answered, value: withText(value, traceText(args.trace, spans)) }
  },
}
