import { TentError } from '../../core/index.ts'
import type { Address } from '../door/address.ts'
import { limitOf } from '../limits.ts'
import { bodyOf } from '../web/body.ts'
import { readJson } from '../web/json.ts'
import { keyed } from '../door/keyed.ts'
import { okAnswer } from '../wire.ts'
import { isWritten } from '../../core/internal.ts'

/**
 * `POST /_t/copy/took`: from a machine that took over, to the writer it followed, with its key: `{ epoch, own? }`.
 * A writer that believes it stops for good, and answers nothing. One that does not answers `{ other, own }`: the
 * newer epoch it knows, and the address of that machine. A machine that is no writer and was never one answers T0030.
 */
export const address: Address = {
  order: 1,
  match: (request) => request.method === 'POST' && new URL(request.url).pathname === '/_t/copy/took' && {},
  steps: [1, 2, 3, 10],
  handle: (reached) =>
    keyed(reached, 'copy/took', async (key) => {
      const { app, request } = reached
      const told = readJson(await bodyOf(request, limitOf(app.description, 'callSize')))
      if (!isWritten(told) || typeof told.epoch !== 'string' || !/^\d+\.[^.]+$/.test(told.epoch))
        throw new TentError('T0002', 'A machine that took over tells its epoch: { "epoch": "<number>.<its id>" }.', {
          fields: { epoch: 'type' },
        })
      const { writer, reader } = app.machine
      if (!writer)
        throw new TentError('T0030', 'This machine is no writer, and was never one: nothing took over from it.', {
          fix: `Tell the writer${reader ? ` at ${reader.writer()}` : ''}.`,
        })
      const own = typeof told.own === 'string' ? told.own : undefined
      return okAnswer(writer.took({ epoch: told.epoch, ...(own ? { own } : {}) }, key) ?? null)
    }),
}
