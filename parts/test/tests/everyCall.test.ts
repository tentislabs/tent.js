import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { buildProject } from '../../build/index.ts'
import type { Room, RoomInput } from '../../engine/index.ts'
import { apartRoom, createEngine } from '../../engine/index.ts'

/** What the test room of the test was asked: each entry, each entry that was called, each draw, back and program. */
interface Counted {
  asked: Map<string, string>
  called: Set<string>
  draws: number
  backs: number
  programs: string[]
}

/** The test room, as a program makes it, counting what it is asked and what of it is called. */
function countingRoom(counted: Counted): (input: RoomInput) => Room {
  return (input) => {
    const room = apartRoom(input)
    const { entry, draw, back, program } = room
    // The room is changed in place: the engine finds its open calls by the room itself.
    return Object.assign(room, {
      entry: (version: string, asked: Parameters<Room['entry']>[1]) => {
        const called = entry(version, asked)
        const key = `${asked.kind} ${asked.module} ${asked.path.join('.')}`
        counted.asked.set(key, asked.kind)
        return (handed: unknown[], o: Parameters<ReturnType<Room['entry']>>[1]) => {
          counted.called.add(key)
          return called(handed, o)
        }
      },
      draw: (version: string) => {
        const drawn = draw(version)
        return (input: Parameters<ReturnType<Room['draw']>>[0], o: Parameters<ReturnType<Room['draw']>>[1]) => {
          counted.draws += 1
          return drawn(input, o)
        }
      },
      back: (...args: Parameters<Room['back']>) => {
        counted.backs += 1
        return back(...args)
      },
      program: (start: Parameters<Room['program']>[0]) => {
        counted.programs.push(start.for)
        return program(start)
      },
    })
  }
}

/** Waits until a test holds, for as long as `within` milliseconds. */
async function until(holds: () => boolean, words: string, within = 20_000): Promise<void> {
  const ends = performance.now() + within
  while (!holds()) {
    if (performance.now() > ends) assert.fail(`never: ${words}`)
    await new Promise((done) => setTimeout(done, 50))
  }
}

/** A copy of the project of the crossing in a folder of the test, built with the build in this program. */
async function built(): Promise<{ bundle: string; data: string; source: string; folder: string }> {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'crossing-'))
  const source = join(folder, 'project')
  cpSync(join(import.meta.dirname, 'crossing'), source, { recursive: true })
  const made = await buildProject(source, { for: 'dev', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  return { bundle: made.bundleFolder, data: join(folder, 'data'), source, folder }
}

test('[52-2] every call crosses: in the test room a project of one of each entry is called through the door, the room is asked each entry and each program, all of them called, and the engine holds no mark of a module of the bundle', async (t) => {
  const counted: Counted = { asked: new Map(), called: new Set(), draws: 0, backs: 0, programs: [] }
  const { bundle, data, source, folder } = await built()
  const engine = createEngine({ port: 0, makers: { room: countingRoom(counted) } })
  // The engine is closed, with the program it started, before its folders are taken away.
  t.after(async () => {
    await engine.close()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const app = await engine.open(bundle, { dataFolder: data, mode: 'development' })
  const port = Number(JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8')).port)
  const at = (path: string, init: RequestInit = {}): Promise<Response> =>
    app.request(new Request(`http://localhost:${port}${path}`, init))
  const nobody = { kind: 'nobody' } as const

  // A query and a change, each with the rules of the table that are code; an action, whose mail goes through the
  // mailer that `engine.ts` made; one of a batch.
  await app.seed()
  assert.equal(await app.call('counted', {}, { as: nobody }), 1)
  await app.call('added', { what: 'one' }, { as: nobody })
  await app.call('mailed', { to: 'ada@example.com' }, { as: nobody })
  assert.equal(await app.call('batched', { n: 2 }, { as: nobody }), 4)
  // A route, with `identify` and `onRequest` of the project; the code screen; `uploads` and `describeTo`.
  const echoed = await at('/echo', { headers: { 'x-crossing-user': 'nobody' } })
  assert.equal(echoed.status, 200, await echoed.clone().text())
  await echoed.text()
  const page = await at('/')
  assert.match(await page.text(), /The crossing/)
  const upload = await at('/_t/files?name=paper.txt', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'content-length': '5', origin: `http://localhost:${port}` },
    body: 'paper',
  })
  await upload.text()
  const described = await at('/api/openapi.json')
  await described.text()
  // A flow whose run takes two steps side by side and fails, and so carries out its own `onFail`.
  await app.start('failing', {}, { as: 'system' })
  await until(() => app.runs.find({ flow: 'failing' }).some((one) => one.state === 'failed'), 'the flow failed')
  await until(
    () => counted.called.has([...counted.asked.keys()].find((key) => key.includes('onFail')) ?? '?'),
    'the onFail was carried out',
  )
  // The program of the outside server of MCP was started by the room.
  await until(() => counted.programs.includes('mcp'), 'the program of the outside server was started')

  const kinds = new Set(counted.asked.values())
  for (const kind of ['query', 'change', 'action', 'rule', 'flow', 'route', 'identify', 'onRequest', 'seed', 'maker'])
    assert.ok(kinds.has(kind), `the room was asked an entry of the kind ${kind}: ${[...kinds].join(', ')}`)
  assert.deepEqual(
    [...counted.asked.keys()].filter((key) => !counted.called.has(key)),
    [],
    'every entry the room was asked was called through it',
  )
  assert.ok(counted.draws > 0, 'the code screen was drawn in the room')
  assert.ok(counted.backs > 0, 'what the code handed the engine was called back in the room')
  // Every module of the project left its mark in the heap that loaded it: the build loaded the source here, and
  // no module of the bundle did.
  const marks: unknown = Reflect.get(globalThis, 'crossingLoaded')
  const loaded = (Array.isArray(marks) ? marks : []).map(String)
  assert.ok(loaded.length > 0, 'the build loaded the project here')
  assert.deepEqual(
    loaded.filter((one) => !one.startsWith(pathToFileURL(source).href)),
    [],
    'no module of the bundle loaded in the heap of the engine',
  )
})
