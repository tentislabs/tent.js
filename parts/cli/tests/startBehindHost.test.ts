import assert from 'node:assert/strict'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { builtShop, freePort, plainly, startTent, untilMinute, workOf } from './secured.ts'
import { startWords } from './startWords.ts'
import { program, typed } from './typed.ts'

test('[21-21] tent start with a proxy of this computer, --proxy from=127.0.0.1, starts, applies its seed and answers', async (t) => {
  const folder = workOf(t, 'proxy-here')
  const { project, bundle } = await builtShop(folder)
  const port = await freePort()
  const data = join(folder, 'data')
  const words = [
    bundle,
    '--data',
    data,
    '--port',
    String(port),
    '--mode',
    'test',
    '--seed',
    '--proxy',
    'from=127.0.0.1',
  ]
  const started = startTent(t, words, { cwd: project })
  await untilMinute(
    () => `${started.out.join('')}${started.err.join('')}`.includes(' runs at http') || started.child.exitCode !== null,
    'the app to run',
  )
  assert.equal(started.child.exitCode, null, `${started.out.join('')}${started.err.join('')}`)
  assert.doesNotMatch(started.err.join(''), /seed was not applied/)
  const health = await plainly(port, `localhost:${port}`, '/_t/health')
  assert.equal(health.status, 200, health.body)
})

// A screen that anyone may see, so that the engine has a page to draw.
const home = `import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => <h1>The home of the shop</h1>,
})
`

test('[21-21] behind a proxy named 127.0.0.1 a command of this computer is refused T0006 and opens no second engine on the data folder, and the engine draws its pages after it', async (t) => {
  const project = join(workOf(t, 'proxy-here-command'), 'shop')
  cpSync(join(import.meta.dirname, 'shop'), project, { recursive: true })
  writeFileSync(join(project, 'home.tsx'), home)
  const built = await buildProject(project, { for: 'release' })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const port = await freePort()
  const data = join(project, 'data')
  const proxy = ['--proxy', 'from=127.0.0.1', '--proxy', 'scheme=http']
  const words = [built.bundleFolder, '--data', data, '--port', String(port), '--mode', 'test', ...proxy]
  const started = startTent(t, words, { cwd: project })
  await untilMinute(
    () => `${started.out.join('')}${started.err.join('')}`.includes(' runs at http') || started.child.exitCode !== null,
    'the app to run',
  )
  assert.equal(started.child.exitCode, null, `${started.out.join('')}${started.err.join('')}`)
  const written = readFileSync(join(data, 'engine.json'), 'utf8')
  const exported = await typed(project, 'export', '--out', 'site', '--data', data, '--json')
  assert.deepEqual([exported.ended, exported.answer.findings?.[0]?.code], [1, 'T0006'], exported.printed)
  assert.match(exported.printed, new RegExp(`program ${started.child.pid}`))
  // The engine that runs holds its data folder: a second opening of it is refused, and the file it wrote stands.
  const second = program(project, ...startWords(['start', built.bundleFolder, '--data', data, '--port', '0', '--json']))
  assert.ok(second.status !== null && second.status !== 0, `${second.out}${second.err}`)
  assert.match(second.out, new RegExp(`"code": "T0013"[^}]*in the program ${started.child.pid}`))
  assert.equal(readFileSync(join(data, 'engine.json'), 'utf8'), written)
  assert.equal(existsSync(join(project, 'site')), false, 'the export wrote nothing')
  const page = await plainly(port, `localhost:${port}`, '/')
  assert.equal(page.status, 200, page.body)
  assert.match(page.body, /The home of the shop/)
})
