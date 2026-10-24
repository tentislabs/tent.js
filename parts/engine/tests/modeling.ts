import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import type { Provider } from '../index.ts'
import { ProviderFailure } from '../index.ts'
import type { Running } from './apps.ts'
import { running } from './apps.ts'

/** A provider that answers a text, with what it reports it used. */
const answering = (text: string, units?: Record<string, number>): Provider => ({
  async *reply() {
    yield { text }
    yield { end: { text, calls: [], ...(units ? { units } : {}) } }
  },
})

/** The providers of the project of the models: one that cannot be reached, and those that answer as each says. */
const providers: Record<string, Provider> = {
  first: {
    async *reply() {
      const failure = new ProviderFailure('unreachable', 'No connection could be made.')
      if (failure.kind === 'unreachable') throw failure
      yield { text: 'never' }
    },
  },
  second: answering('from the backup', { tokensIn: 4, tokensOut: 3 }),
  pics: answering('a picture', { images: 2, tokensOut: 5000 }),
  // Thirty letters, which the rule counts as ten tokens.
  quiet: answering('x'.repeat(30)),
  bytes: answering('some bytes', { bytesOut: 99, tokensIn: 3 }),
}

/** Builds the project of the models and opens it with the providers of the test, in the mode `test`. */
export const modeled = (t: TestContext): Promise<Running> =>
  running(t, { project: 'modeled', engine: { makers: { providers: () => providers } } })

/** The rows of a table of a data file of the test, read with no engine in between, by a statement of its own. */
export function rowsIn(folder: string, file: 'data.db' | 'logs.db', sql: string): Record<string, unknown>[] {
  const data = new DatabaseSync(join(folder, file), { readOnly: true })
  try {
    return data
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }))
  } finally {
    data.close()
  }
}
