import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import type { Engine, Worker } from '../engine/index.ts'
import { createEngine, makeSecretKey, storedValues } from '../engine/index.ts'
import type { Machine, World } from './machines.ts'
import { closeMachine, machineIn, openWriter, reachFor } from './machines.ts'
import { writeOwnerOnly } from '../core/internal.ts'

/** A worker of a test app, with what holds its link back, cuts it, kills it and starts its program again. */
export interface TestWorker extends Worker {
  hold(): void
  free(): void
  cut(): void
  join(): void
  kill(o?: { cause?: 'memory' }): Promise<void>
  restart(): Promise<void>
}

/** What `app.worker` takes. */
export interface WorkerAsked {
  kinds?: string[]
  atOnce?: number
  load?: string[]
  fetched?: string
  // The writer's key of the secrets, as its text, laid into the folder of the worker as its own key file.
  secretKey?: string
  // The secrets of the worker's own machine, with which the work makes its outside calls itself.
  secrets?: Record<string, string>
}

/**
 * Takes the world of a test app, the machine of its writer, and what the worker is asked to be. The writer is
 * opened again with the keys of the workers where it was opened without, and the worker is started in this
 * program on a folder of its own, sharing the clock of the world and joined over the link with no network.
 */
export async function workerOf(world: World, writer: Machine, asked: WorkerAsked = {}): Promise<TestWorker> {
  if (!world.working) {
    world.working = true
    for (const one of world.machines.values())
      if (one.app && one.key === undefined) {
        await closeMachine(one)
        await openWriter(world, one)
      }
  }
  const index = [...world.machines.values()].filter((one) => one.address.includes('worker-')).length
  const key = world.workers[index]
  if (key === undefined)
    throw new TentError('T0013', `A test app has ${world.workers.length} workers at the most.`, {
      fix: 'Use fewer workers in one test.',
    })
  const machine = machineIn(world, 'worker')
  const folder = join(world.home, `worker-${index + 1}`)
  if (asked.secretKey !== undefined) {
    mkdirSync(folder, { recursive: true })
    writeOwnerOnly(join(folder, 'secret.key'), asked.secretKey)
  }
  if (asked.secrets) {
    makeSecretKey(folder)
    const description = writer.app?.description
    if (description)
      for (const [name, value] of Object.entries(asked.secrets))
        storedValues(folder, description, { kind: 'secrets', name, value })
  }
  let engine: Engine | undefined
  let worker: Worker | undefined
  // The programs of this worker that the system of the test ended for want of memory.
  let memory = 0
  const start = async (): Promise<Worker> => {
    engine = createEngine({
      port: 0,
      makers: { clock: () => world.clock, ...(world.room ? { room: world.room } : {}) },
    })
    // The machine holds its engine, so that closing the test app closes the worker with it.
    machine.engine = engine
    worker = await engine.work({
      from: writer.address,
      key,
      kinds: asked.kinds ?? ['any'],
      folder,
      ...(asked.atOnce === undefined ? {} : { atOnce: asked.atOnce }),
      ...(asked.load ? { load: asked.load } : {}),
      ...(asked.fetched ? { fetched: asked.fetched } : {}),
      reach: reachFor(world, machine),
      memory: () => memory,
    })
    return worker
  }
  await start()
  const now = (): Worker => {
    if (!worker)
      throw new TentError('T0013', 'This worker of the test was killed.', { fix: 'Start it again with `restart`.' })
    return worker
  }
  const stop = async (): Promise<void> => {
    for (const gate of [...machine.gates]) gate.close()
    machine.gates.clear()
    const was = engine
    engine = undefined
    delete machine.engine
    worker = undefined
    await was?.close()
  }
  return {
    at: () => now().at(),
    going: (o) => now().going(o),
    close: async (o) => {
      await now().close(o)
      await stop()
    },
    hold() {
      machine.held = true
      for (const gate of machine.gates) gate.hold()
    },
    free() {
      machine.held = false
      for (const gate of machine.gates) gate.release()
    },
    cut() {
      machine.cut = true
      for (const gate of [...machine.gates]) gate.close()
      machine.gates.clear()
    },
    join() {
      machine.cut = false
    },
    // A killed program sends nothing more: its link is cut first, and then it is ended.
    async kill(o) {
      if (o?.cause === 'memory') memory += 1
      machine.cut = true
      await stop()
      machine.cut = false
    },
    async restart() {
      await stop()
      await start()
    },
  }
}
