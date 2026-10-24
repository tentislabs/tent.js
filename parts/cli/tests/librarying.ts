import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { after } from 'node:test'
import type { Page } from '../../../rig/browser.ts'
import { buildProject, npm } from '../../build/index.ts'
import { startDev } from '../dev.ts'
import { fingerprintOf } from '../../core/internal.ts'
import type { App, Engine } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'

const root = join(import.meta.dirname, '..', '..', '..')
const project = join(import.meta.dirname, 'libraries')

// What the tests of a file started and made: each is ended and removed when the file ends, also where a test failed.
const ends: (() => Promise<void> | void)[] = []
after(async () => {
  for (const end of ends.reverse()) await end()
})

/**
 * The packages of the project of the four libraries, installed once from its lock into a folder of their own under
 * `results/`, by the npm of the runtime with the install scripts off and React left to the framework. Answers the
 * folder that holds `node_modules/`. It is the one thing of the tests that is fetched from the registry.
 */
function installedPackages(): string {
  const lock = readFileSync(join(project, 'package-lock.json'))
  const folder = join(root, 'results', 'libraries', `packages-${fingerprintOf(lock).slice(0, 12)}`)
  const done = join(folder, 'installed.txt')
  if (existsSync(done)) return folder
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  mkdirSync(folder, { recursive: true })
  for (const file of ['package.json', 'package-lock.json']) cpSync(join(project, file), join(folder, file))
  const ran = npm(folder, ['ci', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund'], {
    timeout: 600_000,
  })
  assert.equal(ran.status, 0, `npm ci of the libraries: ${ran.said}`)
  writeFileSync(done, 'installed\n')
  return folder
}

/**
 * Lays the project of the four libraries into an empty folder of its own under `results/`, with its packages, and
 * answers the folder. `change` may write a file of it anew first. The folder is removed when the file of the tests ends.
 */
export function laidLibraries(name: string, change?: (folder: string) => void): string {
  const packages = installedPackages()
  const folder = join(root, 'results', 'libraries', name)
  rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  cpSync(project, folder, { recursive: true })
  symlinkSync(join(packages, 'node_modules'), join(folder, 'node_modules'), 'junction')
  change?.(folder)
  ends.push(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return folder
}

/** The project of the four libraries built for release and served in the mode `test`: its address and its app. */
export async function servedLibraries(): Promise<{ address: string; app: App }> {
  const folder = laidLibraries('release')
  const made = await buildProject(folder, { for: 'release' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  const engine: Engine = createEngine({ port: 0 })
  ends.push(() => engine.close())
  const dataFolder = join(folder, '.tent', 'served')
  const app = await engine.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.seed()
  const { port } = JSON.parse(readFileSync(join(dataFolder, 'engine.json'), 'utf8'))
  return { address: `http://localhost:${port}`, app }
}

/** The project of the four libraries in `tent dev`, on a port that the system gives: its address, and the session. */
export async function developedLibraries(): Promise<{ address: string; dev: Awaited<ReturnType<typeof startDev>> }> {
  const folder = laidLibraries('dev')
  const lines: string[] = []
  const dev = await startDev(folder, { port: 0, out: (line) => lines.push(line) })
  ends.push(() => dev.close())
  return { address: `http://localhost:${dev.port}`, dev }
}

/** The screens of the four libraries, each by its address. */
export const libraryScreens = ['/mantine', '/tailwind', '/mui', '/charts'] as const

/** The elements that each screen marks by their ids, which every library draws. */
export const watched = ['lib-card', 'lib-heading', 'lib-group', 'lib-badge', 'lib-button', 'lib-table']

// What is read of the look of an element: twelve properties that a library's styles set.
const looks = [
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'padding-top',
  'padding-left',
  'margin-top',
  'border-top-width',
  'border-top-left-radius',
  'box-shadow',
]

/**
 * Of each watched element that a page shows: whether it has the look of a library, which is that one of twelve
 * properties of its look differs from those of a bare element of the same tag, beside it at the end of the body.
 */
export const styledOf = (page: Page): Promise<Record<string, boolean>> =>
  page.evaluate(
    ([ids, names]) => {
      const styled: Record<string, boolean> = {}
      for (const id of ids) {
        const element = document.getElementById(id)
        if (!element) continue
        const bare = document.createElement(element.tagName)
        document.body.append(bare)
        const own = getComputedStyle(element)
        const plain = getComputedStyle(bare)
        styled[id] = names.some((name) => own.getPropertyValue(name) !== plain.getPropertyValue(name))
        bare.remove()
      }
      return styled
    },
    [watched, looks] as const,
  )

/**
 * Has a page note, from the moment its HTML is read, where each watched element stands at every frame and what it
 * looks like, until a second after it came alive. Answers what reads, once it has, the largest distance an element
 * moved from where the first HTML drew it, in pixels, and the elements whose look changed.
 */
export async function movesOf(page: Page): Promise<() => Promise<{ moved: number; changed: string[] }>> {
  await page.addInitScript(
    ([ids, names]) => {
      const first: Record<string, { x: number; y: number; look: string }> = {}
      let moved = 0
      const changed = new Set<string>()
      const look = (element: Element): string => {
        const style = getComputedStyle(element)
        return names.map((name) => style.getPropertyValue(name)).join(';')
      }
      const frame = (): void => {
        for (const id of ids) {
          const element = document.getElementById(id)
          if (!element) continue
          const box = element.getBoundingClientRect()
          const was = first[id]
          if (!was) first[id] = { x: box.x, y: box.y, look: look(element) }
          else {
            moved = Math.max(moved, Math.hypot(box.x - was.x, box.y - was.y))
            if (look(element) !== was.look) changed.add(id)
          }
        }
        const alive = document.querySelector('#tent[data-t-alive]')
        const since = Number(document.documentElement.getAttribute('data-test-alive-at') ?? 0)
        if (alive && !since) document.documentElement.setAttribute('data-test-alive-at', String(performance.now()))
        if (alive && since && performance.now() - since > 1000) {
          document.documentElement.setAttribute('data-test-moves', JSON.stringify({ moved, changed: [...changed] }))
          return
        }
        requestAnimationFrame(frame)
      }
      // A browser draws no frame before every style file of the head has loaded: the first frame is the first look.
      document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(frame))
    },
    [watched, ['color', 'background-color', 'font-size', 'border-top-width', 'padding-top']] as const,
  )
  return async () => {
    const held = page.locator('html[data-test-moves]')
    await held.waitFor({ state: 'attached' })
    return JSON.parse(String(await held.getAttribute('data-test-moves')))
  }
}

/**
 * A tool of another origin than the app, on this computer, which shows an address of the app in a frame and keeps
 * every message that the frame posts. Answers its origin; it is closed when the file of the tests ends.
 */
export async function frameTool(): Promise<string> {
  const server = createServer((request, response) => {
    const src = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('src') ?? ''
    const app = src ? new URL(src).origin : ''
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      [
        '<!doctype html><html><head><meta charset="utf-8"><title>Tool</title></head><body style="margin:0">',
        `<iframe id="app" src="${src.replaceAll('"', '&quot;')}" style="position:absolute;left:0;top:0;width:800px;height:600px;border:0"></iframe>`,
        `<script>window.got = []; const frame = document.getElementById("app"); addEventListener("message", (event) => { if (event.origin === ${JSON.stringify(app)} && event.source === frame.contentWindow) window.got.push(event.data) })</script>`,
        '</body></html>',
      ].join('\n'),
    )
  })
  ends.push(() => new Promise<void>((done) => server.close(() => done())))
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : ''}`
}

/** Waits until the frame of the tool has posted a message that holds, and answers it. It waits for what it reads. */
export async function toldBy(
  page: Page,
  what: string,
  holds: (one: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (let n = 0; n < 1500; n++) {
    const got: unknown[] = await page.evaluate(() => Reflect.get(window, 'got'))
    const found = got.find(
      (one): one is Record<string, unknown> => typeof one === 'object' && one !== null && holds(Object(one)),
    )
    if (found) return found
    await new Promise((done) => setTimeout(done, 10))
  }
  return assert.fail(`never: ${what}`)
}
