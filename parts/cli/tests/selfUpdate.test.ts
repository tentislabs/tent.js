import assert from 'node:assert/strict'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { shopIn } from './bundledShop.ts'
import { outsideFolderOf, laidInstall, personIn, release, released, startedIn, thisSystem, until } from './released.ts'
import { startWords } from './startWords.ts'

test('[41-13b] a server with --update fixes takes a fix release of its own line by itself, ends with 75 and is started again on it, and takes no other', async (t) => {
  const rel = await released('1.0.0')
  const folder = outsideFolderOf(t, 'self-update')
  // Where releases are served: 1.0.0, and 1.0.1 marked as a fix, signed with the same release key.
  const served = join(folder, 'served')
  cpSync(rel.out, served, { recursive: true })
  const settings = join(folder, 'settings.json')
  writeFileSync(settings, JSON.stringify({ releaseKeys: [rel.key.file] }))
  release([
    '--version',
    '1.0.1',
    '--out',
    served,
    '--systems',
    thisSystem,
    '--settings',
    settings,
    '--fix',
    '--quality',
    '1',
  ])
  // Two more on the list, which a server of the line 1.0 that takes fixes leaves: a fix of another line, and a newer
  // release that is no fix.
  const listFile = join(served, 'releases.json')
  const list = JSON.parse(readFileSync(listFile, 'utf8'))
  list.versions = [
    { version: '1.1.0', day: '2026-11-03', fix: true },
    { version: '1.0.2', day: '2026-11-03', fix: false },
    ...list.versions,
  ]
  list.made = Date.now()
  writeFileSync(listFile, JSON.stringify(list))
  release(['sign', listFile, '--settings', settings])
  const asked: string[] = []
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://here').pathname).replace(/^\/+/, '')
    asked.push(path)
    const file = join(served, path)
    if (!path || !existsSync(file)) return void response.writeHead(404).end()
    response.writeHead(200).end(readFileSync(file))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const at = server.address()
  const address = `http://127.0.0.1:${typeof at === 'object' && at ? at.port : 0}/`
  // An install of 1.0.0, and a server of a bundle on it.
  const person = personIn(folder, { npm: false })
  const launcher = laidInstall(rel, person.tent, ['runtime', 'player'])
  const built = await buildProject(shopIn(folder), { for: 'release' })
  const data = join(folder, 'data')
  // The launcher is ended with the test, with every program it started, before the folder goes.
  const launched = startedIn(
    t,
    launcher,
    startWords(['start', built.bundleFolder, '--data', data, '--port', '0', '--update', 'fixes']),
    {
      cwd: folder,
      env: { ...person.env, TENT_RELEASES: address },
    },
  )
  const engineOf = (): { pid?: number; port?: number } => {
    try {
      return JSON.parse(readFileSync(join(data, 'engine.json'), 'utf8'))
    } catch {
      return {}
    }
  }
  await until(() => typeof engineOf().pid === 'number', 'the first engine', 120_000)
  const first = Number(engineOf().pid)
  await until(
    () => readFileSync(join(person.tent, 'current'), 'utf8').trim() === '1.0.1',
    'the update to 1.0.1',
    300_000,
  )
  await until(() => typeof engineOf().pid === 'number' && engineOf().pid !== first, 'the engine started again', 120_000)
  const health = await fetch(`http://127.0.0.1:${engineOf().port}/_t/health`)
  assert.equal(health.status, 200)
  assert.equal(readFileSync(join(person.tent, 'previous'), 'utf8').trim(), '1.0.0')
  assert.equal(launched.child.exitCode, null, `the launcher runs on: ${launched.said()}`)
  // Of the other two, nothing was fetched.
  assert.equal(
    asked.some((one) => one.startsWith('1.1.0/') || one.startsWith('1.0.2/')),
    false,
    asked.join('\n'),
  )
})
