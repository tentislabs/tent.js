import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { testApp } from '../index.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

// A run that renames one note, as the attacks of undo add it to the notebook.
const renameOne = `
export const renameOne = flow('renameOne', {
  input: { note: text(), title: text() },
  run: async ({ input: given, step }) => step('rename', () => setNote({ note: given.note, title: given.title })),
})
`

test('[45-19.14] an undo leaves a row that another person wrote after the run, also where that person left it as the run did, and names it', async (t) => {
  const folder = copyOf(t, 'undone')
  appendFileSync(join(folder, 'functions', 'functions.ts'), renameOne)
  const app = await testApp({ folder })
  closing(t, () => app.close())
  const as = { as: await app.user({ name: 'Ada', roles: [] }) }
  const note = String(Reflect.get(Object(await app.call('addNote', { title: 'first' }, as)), 'id'))
  const started = await app.start('renameOne', { note, title: 'By the run' }, system)
  assert.ok('run' in started, 'the start was not dropped')
  await app.runs.wait(started.run)
  // Ada writes the note after the run: she renames it, and then names it as the run had, on purpose.
  await app.call('setNote', { note, title: 'Ada after the run' }, as)
  await app.call('setNote', { note, title: 'By the run' }, as)
  const answer = await app.call('undoRun', { run: started.run }, system)
  const title = Reflect.get(Object(await app.read({ from: 'notes', one: 'get', id: note }, system)), 'title')
  assert.equal(title, 'By the run', 'what Ada wrote last stands')
  const clashes: unknown = Reflect.get(Object(answer), 'clashes')
  assert.ok(
    Array.isArray(clashes) && clashes.some((one) => Reflect.get(Object(one), 'id') === note),
    'it is named in clashes',
  )
})
