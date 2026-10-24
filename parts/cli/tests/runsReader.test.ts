import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copied, typed } from './typed.ts'
import { notDropped } from './started.ts'

const key = 'k'.repeat(48)
const moment = (): Promise<void> => new Promise((done) => setTimeout(done, 10))

test('[15-6@7b] [29-10] `tent runs` on the computer of a reader lists and shows the runs from its own data, and on test data a yes that is typed there is carried out by the writer', async (t) => {
  const [one, two] = [createEngine({ port: 0 }), createEngine({ port: 0 })]
  t.after(async () => {
    await two.close()
    await one.close()
  })
  const project = copied(t, 'runs-reader', 'flowShop')
  const built = await buildProject(project, { for: 'dev' })
  const [writerData, readerData] = [join(project, '..', 'writer'), join(project, '..', 'reader')]
  const writer = await one.open(built.bundleFolder, {
    dataFolder: writerData,
    mode: 'test',
    readers: [key],
    insecure: true,
  })
  const { port } = JSON.parse(readFileSync(join(writerData, 'engine.json'), 'utf8'))
  const reader = await two.read({ from: `http://127.0.0.1:${port}`, key, dataFolder: readerData, insecure: true })
  const { run } = notDropped(await writer.start('bigOrder', { title: 'desk' }, { as: 'system' }))
  for (let i = 0; i < 1000 && writer.runs.read(run)?.state !== 'waiting'; i++) await moment()
  for (let i = 0; i < 1000 && !(reader.at().current && reader.at().n === writer.at().n); i++) await moment()
  assert.equal(reader.runs.read(run)?.state, 'waiting')

  // On the writer and on the reader the list and the run are the same.
  const lists = []
  for (const data of [writerData, readerData]) {
    const listed = await typed(project, 'runs', '--data', data, '--json')
    assert.equal(listed.ended, 0, listed.printed)
    lists.push(listed.answer.value)
    const shown = await typed(project, 'runs', 'show', run, '--data', data, '--json')
    assert.deepEqual(
      [shown.ended, Object(shown.answer.value).id, Object(shown.answer.value).state],
      [0, run, 'waiting'],
    )
  }
  assert.deepEqual(lists[0], {
    runs: [{ id: run, flow: 'bigOrder', state: 'waiting', version: built.versionId, step: 'approval' }],
  })
  assert.deepEqual(lists[1], lists[0])

  // A yes that is typed on the reader's computer is the writer's to carry out, and is answered as it answers it.
  const said = await typed(project, 'runs', 'approve', run, 'approval', '--data', readerData, '--json')
  assert.deepEqual([said.ended, said.answer.value], [0, { run, step: 'approval', approved: true }], said.printed)
  assert.match(String(await writer.runs.wait(run)), /^desk \S+ yes \S+$/)
  assert.match(String(await reader.runs.wait(run)), /^desk \S+ yes \S+$/)
  // A run that is not there is told by the reader itself.
  const none = await typed(project, 'runs', 'stop', 'nothere', '--data', readerData, '--json')
  assert.deepEqual([none.ended, none.answer.findings?.[0].code], [1, 'T0001'])
})
