import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { closing, copyOf } from './projects.ts'
import { toldOf } from './told.ts'

const rounds = 100
const system = { as: { kind: 'system' } } as const
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

// What says, where a wait runs out, what each machine of the test holds and says at that moment.
let tells: (() => Promise<string>) | undefined

/**
 * Waits until something holds, for a length of time at the most, and fails with its name where it never does,
 * and with what every machine of the test held and said then.
 */
async function until(what: string, holds: () => boolean | Promise<boolean>, ms = 120_000): Promise<void> {
  for (const ends = performance.now() + ms; performance.now() < ends; await sleep(20)) if (await holds()) return
  const told = await tells?.().catch((error: unknown) => `what the machines hold could not be told: ${String(error)}`)
  assert.fail(`never: ${what}\n${told ?? ''}`)
}

/** Whether nothing listens on a port of this computer, and the system lets a program listen there. */
const isFree = (port: number): Promise<boolean> =>
  new Promise((done) => {
    const asked = createServer()
    asked.once('error', () => done(false))
    asked.listen(port, '127.0.0.1', () => asked.close(() => done(true)))
  })

/**
 * Answers the lowest port that the system gives a program by itself: for a server that asks for any port, and for
 * the near end of every connection that goes out. Linux says it in a file, and macOS and Windows begin at 49152.
 */
function lowestGiven(): number {
  if (process.platform !== 'linux') return 49152
  try {
    const [low] = readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/).map(Number)
    return Number.isInteger(low) && low > 0 ? low : 32768
  } catch {
    return 32768
  }
}

/**
 * A port that a machine of the test keeps over its starts, each of them a new program. It is drawn below the
 * ports that the system gives by itself, and held to be free: a port that the system gave once is given again
 * while the machine is down, to a server of another program or to the near end of a connection that goes out,
 * which holds it for as long as it lives, and the machine then cannot start again.
 */
async function keptPort(taken: number[]): Promise<number> {
  const below = Math.min(lowestGiven(), 32768)
  const from = Math.max(1024, below - 12000)
  for (let tries = 0; tries < 500; tries++) {
    const port = from + randomInt(below - from)
    if (!taken.includes(port) && (await isFree(port))) return port
  }
  return assert.fail(`no port between ${from} and ${below} is free on this computer`)
}

const titlesOf = async (app: App): Promise<string[]> =>
  Object(await app.read({ from: 'orders' }, system)).map((row: { title: string }) => row.title)

test('[29-7] [night] the writer is killed as a program of its own a hundred times under load, and each time the near reader takes over with no write missing that was answered, the far reader follows it, and the old writer comes back as a reader', async (t) => {
  // The machines beat five times a second, so that a reader knows within a second that its writer is gone, and a
  // far reader dials again within two seconds, so that it finds the writer of each round.
  const project = copyOf(t, 'many')
  const tent = join(project, 'tent.ts')
  writeFileSync(
    tent,
    readFileSync(tent, 'utf8').replace(
      "{ title: 'Many machines' }",
      "{ title: 'Many machines', limits: { beat: '200 ms', behind: '1 second', dial: '2 seconds' } }",
    ),
  )
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const work = join(dirname(project), 'machines')
  const folder = (name: string): string => join(work, name)
  const a = await keptPort([])
  const b = await keptPort([a])
  const ports = { a, b, far: await keptPort([a, b]) }
  const keys = { near: 'n'.repeat(40), far: 'f'.repeat(40) }
  const readers = [keys.near, { key: keys.far, far: true as const }]
  const address = (name: keyof typeof ports): string => `http://127.0.0.1:${ports[name]}`
  mkdirSync(work, { recursive: true })
  writeFileSync(folder('plan.json'), JSON.stringify({ ports, keys }))
  writeFileSync(folder('turn.json'), JSON.stringify({ writer: 'a', round: 1 }))
  writeFileSync(folder('answered.log'), '')

  // What each machine is in the program of the test, and what the last try to open it there was refused with.
  const here: Partial<Record<keyof typeof ports, App>> = {}
  const refused: Partial<Record<keyof typeof ports, string>> = {}
  const events: Record<keyof typeof ports, string[]> = { a: [], b: [], far: [] }
  /** Keeps what an engine of the test tells whoever listens, with its moment, for what the test says where a wait runs out. */
  const heard = (engine: Engine, name: keyof typeof ports): void => {
    const kinds = ['machine.behind', 'machine.current', 'machine.ahead', 'writer.changed', 'writer.other'] as const
    for (const kind of [...kinds, 'reader.joined', 'reader.left'] as const)
      engine.on(kind, (told) => {
        const { app: _, ...rest } = told
        events[name].push(`${new Date().toISOString()} ${kind} ${JSON.stringify(rest)}`)
      })
  }
  const harness: { failed?: string } = {}
  tells = async () => {
    const names = ['a', 'b', 'far'] as const
    const machines = names.map((name) => ({
      name,
      address: address(name),
      folder: folder(name),
      out: folder(`out.${name}.log`),
      ...(here[name] ? { app: here[name] } : {}),
      ...(refused[name] ? { refused: refused[name] } : {}),
      events: events[name],
    }))
    const turn = readFileSync(folder('turn.json'), 'utf8')
    const notes = readdirSync(work).filter((name) => /^(ready|loaded|took|back)\./.test(name))
    const last = (kind: string): string =>
      notes
        .filter((name) => name.startsWith(kind))
        .map((name) => Number(name.split('.')[1]))
        .sort((x, y) => y - x)
        .slice(0, 1)
        .join('')
    return [
      `the turn: ${turn}, the ports: ${JSON.stringify(ports)}, the system: ${process.platform}`,
      `the newest notes of the rounds: ready ${last('ready')}, loaded ${last('loaded')}, took ${last('took')}, back ${last('back')}`,
      `the kill harness: ${harness.failed ?? 'at work, or ended well'}`,
      `the writes that were answered: ${readFileSync(folder('answered.log'), 'utf8').split('\n').filter(Boolean).length}`,
      await toldOf(machines),
    ].join('\n')
  }
  t.after(() => {
    tells = undefined
  })

  // The readers of the test: each an engine of its own, on the port that its folder keeps.
  const engines = new Set<Engine>()
  closing(t, async () => {
    for (const engine of engines) await engine.close()
  })
  /** Opens a folder as a reader of the machine at another, and answers the app and what closes its engine. */
  const reading = async (
    name: keyof typeof ports,
    from: keyof typeof ports,
  ): Promise<{ app: App; close(): Promise<void> }> => {
    let engine = createEngine({ port: ports[name] })
    engines.add(engine)
    heard(engine, name)
    const options = { from: address(from), dataFolder: folder(name), own: address(name), readers, insecure: true }
    const opened: { app?: App } = {}
    // A reader that starts empty answers T0029 until its writer is reached: the writer is a program that starts.
    await until(`the reader ${name} is opened`, async () => {
      try {
        opened.app = await engine.read({ ...options, key: name === 'far' ? keys.far : keys.near, far: name === 'far' })
        return true
      } catch (error) {
        const code = String(Reflect.get(Object(error), 'code'))
        refused[name] = `${code} ${String(error)}`
        if (code !== 'T0029' && code !== 'EADDRINUSE') throw error
        if (code === 'T0029') return false
        // Its port is still held by the program that ran in its folder a moment ago: an engine listens once, so
        // the port is asked for again by a new one.
        engines.delete(engine)
        await engine.close()
        engine = createEngine({ port: ports[name] })
        engines.add(engine)
        heard(engine, name)
        return false
      }
    })
    const { app } = opened
    assert.ok(app)
    here[name] = app
    delete refused[name]
    return {
      app,
      async close() {
        delete here[name]
        engines.delete(engine)
        await engine.close()
      },
    }
  }

  const program = join(import.meta.dirname, 'killed', 'writer.ts')
  const killing = runKilled(program, {
    times: rounds,
    when: 'loaded',
    seed: 29,
    args: [built.bundleFolder, work],
    wait: 180_000,
  })
  // A kill that fails ends the test where it waits, by the time of its waits: the failure is read at the end.
  killing.catch((error: unknown) => {
    harness.failed = String(error)
  })

  let [writer, reader]: ('a' | 'b')[] = ['a', 'b']
  let near = await reading(reader, writer)
  const far = await reading('far', writer)
  const answered = (): string[] => readFileSync(folder('answered.log'), 'utf8').split('\n').filter(Boolean)
  for (let round = 1; round <= rounds; round++) {
    // The load begins once the far reader follows the writer of this round, and was told by it of the near reader
    // with its own address: a kill takes what the writer had sent and a reader had not yet been handed.
    const [nearOwn, writerOwn] = [address(reader), address(writer)]
    await until(`the far reader knows the machines of round ${round}`, () => {
      const known = far.app.machines()
      return far.app.at().current && known[0]?.own === writerOwn && known.some((one) => one.own === nearOwn)
    })
    writeFileSync(folder(`ready.${round}`), '')
    // The writer is under load once it says so: reads arrive on the near reader while it is killed.
    await until(`the writer of round ${round} is under load`, () => existsSync(folder(`loaded.${round}`)))
    const seen: string[] = []
    for (let i = 0; i < 3; i++) seen.push(...(await titlesOf(near.app).catch(() => [])))
    // The near reader takes over once it knows that its writer is gone: while it is current it is refused.
    const taken: { took?: { epoch: string; n: number } } = {}
    await until(`the near reader of round ${round} took over`, async () => {
      try {
        taken.took = await near.app.takeOver()
        return true
      } catch (error) {
        if (!['T0032', 'T0029'].includes(String(Reflect.get(Object(error), 'code')))) throw error
        return false
      }
    })
    const { took } = taken
    assert.ok(took)
    assert.equal(near.app.role, 'writer', `round ${round}`)
    assert.equal(took.epoch.split('.')[0], String(round + 1))
    // Nothing that was answered is missing, and no read was answered a row that is.
    const held = new Set(await titlesOf(near.app))
    for (const title of answered()) assert.equal(held.has(title), true, `${title} was answered, and is held`)
    for (const title of seen) assert.equal(held.has(title), true, `${title} was read, and is held`)
    assert.ok(answered().filter((title) => title.startsWith(`round ${round} `)).length >= 5, `round ${round} wrote`)
    writeFileSync(folder(`took.${round}`), JSON.stringify(took))
    // The far reader finds the new writer by its own address, and follows it.
    await until(
      `the far reader follows the writer of round ${round}`,
      () => far.app.at().epoch === took.epoch && far.app.at().n === near.app.at().n,
    )
    // The old writer was started again with `reads`: it follows the new writer, and ends by itself. Where it held
    // a write that the new writer lacks, it kept its file, under the number that it held.
    await until(`the old writer of round ${round} came back as a reader`, () => existsSync(folder(`back.${round}`)))
    const back = JSON.parse(readFileSync(folder(`back.${round}`), 'utf8'))
    // The old writer holds every write up to the taking over, and none the new writer lacks. The new writer goes on
    // writing what it knows of its machines, the old one among its near readers too, which may reach the old writer
    // after it ended.
    const now = near.app.at().n
    assert.ok(
      back.n >= took.n && back.n <= now,
      `round ${round}: the old writer holds ${back.n}, took ${took.n}, now ${now}`,
    )
    assert.ok(back.lost.length <= 1, `round ${round}: ${back.lost}`)
    for (const name of back.lost) {
      const [, epoch, n] = /^lost\.(\d+)\.(\d+)\.db$/.exec(name) ?? []
      assert.equal(epoch, String(round), name)
      assert.ok(Number(n) >= took.n, `${name} holds more than the ${took.n - 1} writes that the new writer had`)
    }
    if (round === rounds) break
    // The machines turn: the folder that took over is the writer's in the next round, as a program of its own,
    // and the folder that came back is its near reader, in the program of the test.
    await near.close()
    ;[writer, reader] = [reader, writer]
    near = await reading(reader, writer)
    writeFileSync(folder('turn.json'), JSON.stringify({ writer, round: round + 1 }))
  }
  const killed = await killing
  assert.equal(killed.kills, rounds)
  assert.deepEqual(
    killed.ended.filter((one) => one.code !== 0).map((one) => one.out.slice(-300)),
    [],
  )
  assert.equal(near.app.at().epoch.split('.')[0], String(rounds + 1))
  assert.deepEqual(await titlesOf(far.app), await titlesOf(near.app))
})
