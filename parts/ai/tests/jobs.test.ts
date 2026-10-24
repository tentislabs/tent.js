import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { model, object, text } from '../../core/index.ts'
import { ProviderFailure } from '../../core/internal.ts'
import type { Provider } from '../index.ts'
import { codeOf, layerOf } from './env.ts'
import { copyOf, workFolder } from './projects.ts'

const input = { prompt: text() }
const output = object({ picture: text() })

test('[26-5] a begin that fails goes to the next model, and a job that passes limits.time after it was begun fails with T7104 and is given to no second model', async () => {
  let begun = 0
  let called = 0
  const failing: Provider = {
    begin: async () => {
      begun++
      throw new ProviderFailure('server', 'It could not begin.')
    },
    check: async () => ({ wait: 1000 }),
  }
  const answering: Provider = {
    call: async () => {
      called++
      return { output: { picture: 'from the backup' } }
    },
  }
  const backup = model('backup', { provider: 'answering', name: 'b-1', input, output })
  const slow = model('slow', { provider: 'failing', name: 's-1', input, output, fallback: [backup] })
  const layer = layerOf([slow, backup], { providers: { failing, answering } })
  assert.deepEqual(await layer.call('slow', 'call', [{ prompt: 'a tent' }]), { picture: 'from the backup' })
  // A begin that fails with a server's error is tried once more, as any call is, and then given to the next model.
  assert.deepEqual([begun, called], [2, 1])
  // Begun, the job is checked on the engine's clock until its time is up, and no second model is asked.
  let checks = 0
  const waits: Provider = {
    begin: async () => ({ job: 'job-1' }),
    check: async () => {
      checks++
      return { wait: 1000 }
    },
  }
  const long = model('long', {
    provider: 'waits',
    name: 'l-1',
    input,
    output,
    limits: { time: '3 seconds' },
    fallback: [backup],
  })
  const timed = layerOf([long, backup], { providers: { waits, answering } })
  const failed = await Promise.resolve(timed.call('long', 'call', [{ prompt: 'a tent' }])).catch(
    (error: unknown) => error,
  )
  assert.equal(Reflect.get(Object(failed), 'code'), 'T7104')
  assert.equal(called, 1)
  assert.equal(checks, 4)
  assert.deepEqual(timed.slept, [1000, 1000, 1000, 1000])
  // The job was handed to the engine to keep, with the model that began it.
  assert.equal(Reflect.get(Object(timed.kept.value), 'job'), 'job-1')
  assert.equal(Reflect.get(Object(timed.kept.value), 'model'), 'long')
  // A job that a step kept is gone on with, on the model that began it: no second begin.
  let again = 0
  const goesOn: Provider = {
    begin: async () => {
      again++
      return { job: 'job-2' }
    },
    check: async (o) => ({ output: { picture: `done ${o.job}` } }),
  }
  const kept = layerOf([model('long', { provider: 'goesOn', name: 'l-1', input, output })], { providers: { goesOn } })
  kept.kept.value = { job: 'job-1', model: 'long', begunAt: Date.UTC(2032, 0, 1) }
  assert.deepEqual(await kept.call('long', 'call', [{ prompt: 'a tent' }]), { picture: 'done job-1' })
  assert.equal(again, 0)
  assert.equal(await codeOf(kept.call('long', 'call', [{ prompt: 3 }])), 'T0002')
})

test('[26-5] the program killed while the model layer waits for a long job begins no second job after the restart', async (t) => {
  const folder = workFolder(t)
  const program = join(import.meta.dirname, 'killed', 'job.ts')
  const killed = await runKilled(program, {
    times: 1,
    when: 'waiting',
    seed: 26,
    args: [copyOf(t, 'jobs'), join(folder, 'bundle'), join(folder, 'data'), join(folder, 'told')],
  })
  const [again] = killed.ended
  assert.equal(again.code, 0, again.out)
  assert.match(again.out, /^answer: "made of job 1"$/m)
  // The job was begun once, before the kill: the step that ran again went on with it.
  assert.deepEqual(
    readFileSync(join(folder, 'told', 'begun.txt'), 'utf8')
      .trim()
      .split('\n'),
    ['begun'],
  )
})
