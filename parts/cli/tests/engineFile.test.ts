import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, typedApart } from './typed.ts'

test('[15-6@4] [05-3.10] with a folder in the place of engine.json a command says so and ends, and starts no engine that cannot open', (t) => {
  const project = copied(t, 'engine-file-folder')
  const data = join(project, '.tent')
  mkdirSync(join(data, 'engine.json'), { recursive: true })
  // Each is a program of its own, so that one which does not end is seen: a command that starts an engine where
  // none runs, one that starts none, and one that takes its facts from an engine.
  for (const words of [['logs'], ['data', 'rows', 'orders'], ['machines'], ['check']]) {
    const output = typedApart(project, ...words, '--json')
    // It ends by itself, with 1 for what it found or 2 for what it could not carry out, and never with 0.
    assert.ok([1, 2].includes(output.ended), `tent ${words.join(' ')} ends by itself: ${output.printed.slice(0, 300)}`)
    assert.match(output.printed, /engine\.json/, words.join(' '))
    assert.match(output.printed, /folder/, words.join(' '))
    // No engine was started on the data folder: it holds no data, no log and no version.
    const made = readdirSync(data).filter((name) => /\.db|^versions$|^backups$/.test(name))
    assert.deepEqual(made, [], words.join(' '))
    assert.equal(existsSync(join(data, 'data.db')), false)
  }
})
