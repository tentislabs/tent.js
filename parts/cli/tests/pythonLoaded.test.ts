import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Every file that is loaded from here on, by its address. The hook stands before anything of the engine is
// imported, which is why this file imports what it uses inside its test and not at its top.
const loaded: string[] = []
registerHooks({
  resolve(name, context, next) {
    const found = next(name, context)
    loaded.push(found.url)
    return found
  },
})
const ofPython = (): string[] => loaded.filter((address) => /\/parts\/engine\/python\//.test(address))

test('[21-24@9d] an app that has no python loads nothing of the Python program, an app with a python loads it at its first call, and an app that falls asleep gives its Python programs back', async (t) => {
  const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { buildProject } = await import('../../build/index.ts')
  const { createEngine } = await import('../../engine/index.ts')
  const { pythonStandIn, testPackages } = await import('./pythonStandIn.ts')
  const { copied, root, typed } = await import('./typed.ts')
  const { numberish, running, untilWithin } = await import('./pythonApps.ts')

  const folder = join(root, 'results', 'cli', 'python-loaded')
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  const stand = await pythonStandIn(t, [...testPackages(), numberish])
  const saved = { home: process.env.TENT_HOME, parts: process.env.TENT_PARTS }
  process.env.TENT_HOME = mkdtempSync(join(folder, 'home-'))
  process.env.TENT_PARTS = stand.parts
  t.after(() => {
    process.env.TENT_HOME = saved.home
    process.env.TENT_PARTS = saved.parts
  })
  const engine = createEngine({ port: 0 })
  t.after(async () => {
    await engine.close()
    rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })

  // A shop with no python: built, opened, called, and nothing of the Python program is there.
  const shop = copied(t, 'python-loaded-shop', 'shop')
  const plain = await buildProject(shop, { for: 'dev' })
  const app = await engine.open(plain.bundleFolder, { dataFolder: join(folder, 'shop-data'), mode: 'development' })
  await app.write([{ add: 'customers', values: { name: 'Ada' } }], { as: 'system' }).catch(() => undefined)
  assert.ok(
    loaded.some((address) => address.includes('/parts/engine/')),
    'the hook saw the engine load',
  )
  assert.deepEqual(ofPython(), [])

  // An app with a python loads it at its first call, and gives its Python program back when it falls asleep.
  const project = join(folder, 'pythonCalls')
  cpSync(join(import.meta.dirname, 'pythonCalls'), project, { recursive: true })
  // An idle Python program is ended after ten minutes here: what ends it within the test is the app's sleep.
  const tent = join(project, 'tent.ts')
  writeFileSync(
    tent,
    readFileSync(tent, 'utf8').replace("pythonStopAfter: '3 seconds'", "pythonStopAfter: '10 minutes'"),
  )
  const locked = await typed(project, 'python', 'lock')
  assert.equal(locked.ended, 0, locked.printed)
  const built = await buildProject(project, { for: 'dev' })
  const sleepy = await engine.open(built.bundleFolder, {
    dataFolder: join(folder, 'calls-data'),
    mode: 'development',
    sleepAfter: '2 seconds',
  })
  const rows: unknown = await sleepy.write([{ add: 'users', values: { name: 'Ada', roles: [] } }], { as: 'system' })
  const id = String(Reflect.get(Object(Array.isArray(rows) ? rows[0] : rows), 'id'))
  const pid = Number(await sleepy.call('pid', {}, { as: { kind: 'user', user: { id, roles: [] } } }))
  assert.ok(ofPython().length > 0)
  assert.equal(running(pid), true)
  await untilWithin(() => !running(pid), 'the app fell asleep and its Python program was ended', 20_000)
})
