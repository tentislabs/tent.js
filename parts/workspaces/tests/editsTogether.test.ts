import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { scripted } from './tooled.ts'
import { turned } from './turned.ts'

test('[40-17] two edits of one file that a model asks for in one step each land: the file holds both, and each answers that it changed it', async (t) => {
  const at = await turned(t)
  const path = 'screens/home.tsx'
  const model = scripted([
    {
      calls: [
        { tool: 'edit', with: { path, find: "title: 'Notes',", with: "title: 'My notes'," } },
        { tool: 'edit', with: { path, find: 'No notes', with: 'Nothing yet' } },
      ],
    },
    { text: 'Done.' },
  ])
  at.app.standIn('writer', model.provider)
  const turn = await at.workspaces.turn(at.made.id, 'builder', 'Rename the title and the empty text', {
    caller: at.caller,
    thread: at.thread,
  })
  assert.equal(turn.state, 'done', JSON.stringify(turn))
  const answers = (model.sent.at(-1)?.messages ?? []).filter((one) => one.who === 'tool')
  assert.equal(answers.length, 2)
  for (const answer of answers) assert.equal(answer.error, undefined, JSON.stringify(answer))
  const text = readFileSync(join(at.made.folder, 'project', path), 'utf8')
  assert.match(text, /title: 'My notes',/)
  assert.match(text, /Nothing yet/)
})
