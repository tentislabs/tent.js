import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { TestContext } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { App, BrowserEngine } from '../../engine/index.ts'
import { browsed, createEngine } from '../../engine/index.ts'
import { copyOf } from './projects.ts'

/** A program of this computer on a port of its own, which counts every request and every opening of a socket it is sent. */
async function listening(t: TestContext): Promise<{ port: number; reached: () => string[] }> {
  const reached: string[] = []
  const server = createServer((request, answer) => {
    reached.push(`${request.method} ${request.url}`)
    answer.end('reached')
  })
  server.on('upgrade', (request, socket) => {
    reached.push(`upgrade ${request.url}`)
    socket.destroy()
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const at = server.address()
  return { port: typeof at === 'object' && at !== null ? at.port : 0, reached: () => [...reached] }
}

/** An app of the project `looked` in the mode `test`, ended when the test ends. */
async function opened(t: TestContext): Promise<App> {
  const home = mkdtempSync(join(tmpdir(), 'tent-attack-opened-'))
  const engine = createEngine({ port: 0 })
  t.after(async () => {
    await engine.close()
    rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })
  const built = await buildProject(copyOf(t, 'looked'), { for: 'dev', out: join(home, 'bundle') })
  return engine.open(built.bundleFolder, { dataFolder: join(home, 'data'), mode: 'test' })
}

const engines: BrowserEngine[] = ['chromium', 'firefox']

for (const engine of engines)
  test(`[48-7.4] a test page in ${engine} steered to a private address of the network, by its address, by a call of its code and by a socket, reaches nothing there`, async (t) => {
    const app = await opened(t)
    const { port, reached } = await listening(t)
    const page = await browsed(app, { engine, size: { width: 800, height: 600 }, dark: false })
    t.after(() => page.end())
    // The page is steered there by its address, under each name of this computer.
    for (const address of [
      `http://127.0.0.1:${port}/steered`,
      `http://localhost:${port}/steered`,
      `http://[::1]:${port}/steered`,
    ])
      await page.go(address).catch(() => undefined)
    // From a page of the app, its code asks there by every way a page reaches the network.
    await page.go(`${page.origin}/plain`)
    await Promise.race([page.loaded(), new Promise((done) => setTimeout(done, 3_000))])
    const tries = [
      `fetch('http://127.0.0.1:${port}/fetched').then(() => 'answered', () => 'refused')`,
      `new Promise((done) => { const image = new Image(); image.onload = image.onerror = () => done('ended'); image.src = 'http://127.0.0.1:${port}/image' })`,
      `Promise.resolve(navigator.sendBeacon('http://127.0.0.1:${port}/beacon', 'x'))`,
      `new Promise((done) => { try { const socket = new WebSocket('ws://127.0.0.1:${port}/socket'); socket.onopen = socket.onerror = socket.onclose = () => done('ended') } catch { done('refused') } })`,
      `new Promise((done) => { const form = document.createElement('form'); form.method = 'POST'; form.action = 'http://127.0.0.1:${port}/form'; document.body.append(form); form.submit(); setTimeout(() => done('sent'), 300) })`,
    ]
    for (const one of tries) await page.evaluate(one).catch(() => undefined)
    // A moment for anything that left to arrive, as the program here would hear it.
    await new Promise((done) => setTimeout(done, 500))
    assert.deepEqual(reached(), [])
  })
