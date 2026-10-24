import assert from 'node:assert/strict'
import test from 'node:test'
import { runsElevated } from '../../core/internal.ts'
import { startWords } from './startWords.ts'

const words = ['start', 'bundle', '--data', 'data', '--port', '0', '--mode']

test('[41-14] the words of tent start that a test types are unchanged where its program does not run with the rights of an administrator', () => {
  assert.deepEqual(startWords(words, false), words)
  assert.deepEqual(startWords(['--data', 'data', ...words], false), ['--data', 'data', ...words])
})

test('[41-14] where its program runs with the rights of an administrator, they carry --as-root right after start, so that no word that follows takes it as its value', () => {
  assert.deepEqual(startWords(words, true), ['start', '--as-root', ...words.slice(1)])
  assert.deepEqual(startWords(['--data', 'data', ...words], true), [
    '--data',
    'data',
    'start',
    '--as-root',
    ...words.slice(1),
  ])
})

test('[41-14] the rights are read from this program itself, and only on Windows', () => {
  const elevated = process.platform === 'win32' && runsElevated()
  assert.deepEqual(startWords(words), elevated ? ['start', '--as-root', ...words.slice(1)] : words)
})
