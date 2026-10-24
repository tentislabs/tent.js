import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { browsed } from '../index.ts'
import { running, send } from './apps.ts'

/** The messages of the lines of the log of a data folder. */
function linesOf(dataFolder: string): string[] {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return log
      .prepare('SELECT message FROM lines ORDER BY rowid')
      .all()
      .map((row) => String(row.message))
  } finally {
    log.close()
  }
}

/** Writes a project of its files into a folder of its own under the results, and answers its place from here. */
function projectOf(t: test.TestContext, files: Record<string, string>): string {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'mended-'))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text)
  return relative(here, folder).replaceAll('\\', '/')
}

test('[25-11] a program of an outside server that cannot be started is said in the log', async (t) => {
  const project = projectOf(t, {
    'tables.ts': `import { project, service } from 'tentjs'\n\nexport const lone = project('lone', {})\n\nexport const local = service('local', { mcp: { command: ['tent-no-such-program-there'] } })\n`,
    'functions.ts': 'export {}\n',
  })
  const { dataFolder } = await running(t, { project })
  let lines: string[] = []
  for (let tries = 0; tries < 40 && !lines.some((one) => one.includes('cannot be started')); tries++) {
    await new Promise((done) => setTimeout(done, 250))
    lines = linesOf(dataFolder)
  }
  assert.ok(
    lines.some((one) => one.startsWith('The program of local cannot be started')),
    lines.join('\n'),
  )
})

test('[48-1] in firefox an app with a name of its own is reached under that name, and never under `*`', {
  timeout: 120_000,
}, async (t) => {
  const { app } = await running(t, { open: { address: ['*', 'shop.test'] } })
  const page = await browsed(app, { engine: 'firefox', size: { width: 800, height: 600 }, dark: false })
  t.after(() => page.end())
  const loaded = page.loaded()
  await page.go('http://shop.test/_t/health')
  await loaded
  const shown = String(await page.evaluate('document.body.innerText'))
  assert.match(shown, /ok/i, `the app answered under its name: ${shown.slice(0, 200)}`)
})

test('[15-6] tent access lists what the project opened with unlock', async (t) => {
  const project = projectOf(t, {
    'tables.ts': `import { project } from 'tentjs'\n\nexport const opened = project('opened', { unlock: { wasm: true, scripts: ['https://js.stripe.com'] } })\n`,
    'functions.ts': 'export {}\n',
  })
  const run = await running(t, { project })
  const token = String(JSON.parse(readFileSync(join(run.dataFolder, 'engine.json'), 'utf8')).token)
  const answered = await send(run.app, `${run.origin}/_t/admin/access`, {
    body: JSON.stringify({ args: {} }),
    headers: { authorization: `Bearer ${token}` },
  })
  assert.equal(answered.status, 200, JSON.stringify(answered.body))
  assert.deepEqual(Object(answered.body.value).unlock, { wasm: true, scripts: ['https://js.stripe.com'] })
})
