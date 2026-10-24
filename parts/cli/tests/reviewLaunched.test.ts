import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import type { Terminal } from '../../core/index.ts'
import { add } from '../added.ts'
import { valueText } from '../print.ts'
import { definitionOf } from '../service/definitions.ts'
import { root } from './typed.ts'

/** An empty folder under the folder that git leaves out, removed when the test ends. */
function emptyFolder(t: { after(fn: () => void): void }, name: string): string {
  const under = join(root, 'results', 'cli')
  mkdirSync(under, { recursive: true })
  const folder = mkdtempSync(join(under, `${name}-`))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  return folder
}

/** A terminal that a person answers nothing at, and that keeps what is written to it. */
const silent = (): Terminal & { said: string[] } => {
  const said: string[] = []
  return {
    said,
    write: (text) => void said.push(text),
    error: (text) => void said.push(text),
    raw: (text) => void said.push(text),
    line: async () => undefined,
    keys: async function* () {},
    size: () => ({ columns: 80, rows: 24 }),
    onResize: () => () => undefined,
    interactive: false,
    color: false,
  }
}

test('[24-15] the launcher that tent cli add writes starts the tent program of the install, which outlives every version, and never the runtime and the files of one version', async (t) => {
  const home = emptyFolder(t, 'review-launcher')
  // The install's own launchers, as an installer lays them.
  mkdirSync(join(home, 'bin'), { recursive: true })
  for (const one of ['tent', 'tent.exe']) writeFileSync(join(home, 'bin', one), '')
  const terminal = silent()
  const ended = await add({
    home,
    address: 'https://shop.example.com',
    yes: true,
    terminal,
    listed: async () => ({ name: 'shop' }),
  })
  assert.equal(ended, 0, terminal.said.join(''))
  const unix = readFileSync(join(home, 'bin', 'shop'), 'utf8').split('\n')
  // The launcher names the program that wrote it, then `cli`: `exec "<the tent program>" cli "<target>" "$@"`.
  assert.equal(unix[1], `exec "${join(home, 'bin', 'tent')}" cli "https://shop.example.com" "$@"`)
  const windows = readFileSync(join(home, 'bin', 'shop.cmd'), 'utf8').split(/\r?\n/)
  assert.equal(windows[1], `"${join(home, 'bin', 'tent.exe')}" cli "https://shop.example.com" %*`)
})

test('[24-14] the terminal that a command written in code is handed gives the keys that are typed, one by one', () => {
  const terminal = pathToFileURL(join(import.meta.dirname, '..', 'terminal.ts')).href
  const script = [
    `import { processTerminal } from ${JSON.stringify(terminal)}`,
    'const { terminal, close } = processTerminal()',
    'for await (const key of terminal.keys()) { process.stdout.write(JSON.stringify(key)); break }',
    'close()',
    'process.exit(0)',
  ].join('\n')
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    input: 'a',
    encoding: 'utf8',
    timeout: 30_000,
    env,
  })
  assert.equal(ran.status, 0, ran.stderr)
  assert.match(ran.stdout, /"text":"a"/, 'the key that was typed arrives')
})

test('[24-13] what a command of tent prints of an answer of the app holds no control character that could drive the terminal', () => {
  // A row of the app, as `tent data rows` or `tent run` prints it: its text came from a user of the app.
  const printed = valueText({ title: 'Paid\u001b]0;owned\u0007\u001b[2J' })
  const controls = [...printed].filter((one) => {
    const code = one.charCodeAt(0)
    return (code < 32 && code !== 10 && code !== 9) || (code >= 127 && code <= 159)
  })
  assert.deepEqual(controls, [], JSON.stringify(printed))
})

test('[41-13a] tent service writes the name of an app into a systemd unit so that no line of its own begins there', () => {
  // The name comes from the description of a bundle, which another may have written.
  const name = 'Shop\nExecStartPre=+/bin/sh -c id\n[Install]'
  const defined = { name, user: 'shop', home: '/home/shop/.tent', words: ['start', '/srv/shop'], machine: false }
  const unit = definitionOf('linux', defined).split('\n')
  assert.equal(
    unit.some((line) => line.startsWith('ExecStartPre')),
    false,
    unit.join('\n'),
  )
  assert.equal(unit.filter((line) => line === '[Install]').length, 1, unit.join('\n'))
})
