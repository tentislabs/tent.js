import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { npm, npmProgram } from '../index.ts'

// The npm that the running runtime came with: beside the runtime on Windows, and under `lib` on every other system.

test('[15-1] the npm of a runtime is found beside it, as on Windows, and under lib, as on Linux and macOS, and nowhere else', (t) => {
  const root = join(process.cwd(), 'results', 'build', `npm-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const inside = ['node_modules', 'npm', 'bin', 'npm-cli.js']
  const lay = (path: string[]): string => {
    const lies = join(root, ...path)
    mkdirSync(join(lies, '..'), { recursive: true })
    writeFileSync(lies, '')
    return lies
  }
  // Windows: the runtime and its node_modules lie side by side.
  const windows = lay(['windows', ...inside])
  assert.equal(npmProgram(join(root, 'windows', 'node.exe')), windows)
  // Linux and macOS: bin/node, and lib/node_modules beside bin.
  const unix = lay(['unix', 'lib', ...inside])
  assert.equal(npmProgram(join(root, 'unix', 'bin', 'node')), unix)
  // A runtime with neither has no npm.
  assert.equal(npmProgram(join(root, 'none', 'bin', 'node')), undefined)
})

test('[15-1] the npm of the running runtime is carried out in a folder, and answers what it said', () => {
  const ran = npm(process.cwd(), ['--version'])
  assert.equal(ran.status, 0, ran.said)
  assert.match(ran.said, /^\d+\.\d+\.\d+/)
})
