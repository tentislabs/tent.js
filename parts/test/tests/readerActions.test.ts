import assert from 'node:assert/strict'
import test from 'node:test'
import { TentError } from '../../core/index.ts'
import { testApp } from '../index.ts'
import { current, readersHeld } from './many.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** The code of what a call was refused with. */
const refusal = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work
  } catch (error) {
    return error instanceof TentError ? error.code : String(error)
  }
  return 'answered'
}

test(
  '[51-12] an action that states changes false is carried out by the reader that got it, a change it calls is T0013 on the reader and on the writer, and one that also states background is the writer one',
  readersHeld,
  async (t) => {
    const app = await testApp({ folder: copyOf(t, 'readerActions') })
    closing(t, () => app.close())
    const near = await app.reader()
    await current(app, near)
    const writer = String(await app.call('writersOwn', undefined, system))
    assert.equal(await app.call('quiet', undefined, system), writer, 'on the writer it is the writer that answers')
    assert.equal(await near.call('writersOwn', undefined, system), writer, 'an action that may write is handed on')
    const quiet = String(await near.call('quiet', undefined, system))
    assert.notEqual(quiet, writer, 'the reader handed on an action that changes nothing')
    assert.equal(await refusal(near.call('quietWrites', undefined, system)), 'T0013')
    assert.equal(await refusal(app.call('quietWrites', undefined, system)), 'T0013')
    assert.equal(
      await near.call('quietOnThread', undefined, system),
      writer,
      'an action that states background is the writer one',
    )
  },
)
