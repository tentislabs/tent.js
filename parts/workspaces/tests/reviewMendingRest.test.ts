import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { tooled } from './tooled.ts'

// The review of the mending, of `workspaces`: what `rename` takes for a plain place and for a place in code.

/** The text of a file of the project of a workspace. */
const fileOf = (folder: string, path: string): string => readFileSync(join(folder, 'project', path), 'utf8')

test('[40-17] rename changes the plain places of the data arrow of a screen, which the description holds as it is written', async (t) => {
  const { tool, made } = await tooled(t)
  // `data` written as an arrow over the values of the address: the description holds it as it is written.
  await tool('write', {
    path: 'screens/desk.tsx',
    text: "import { anyone, read, screen } from 'tentjs/ui'\nimport { allNotes } from '../functions/users'\n\nexport const deskScreen = screen('deskScreen', {\n  path: '/desk/:id',\n  access: anyone('the notes of a test app'),\n  data: ({ params }) => ({ notes: read(allNotes) }),\n  view: ({ notes }) => <p>{notes.length}</p>,\n})\n",
  })
  await tool('rename', { name: 'allNotes', to: 'everyNote' })
  const desk = fileOf(made.folder, 'screens/desk.tsx')
  assert.match(desk, /import \{ everyNote \} from '..\/functions\/users'/)
  assert.match(desk, /data: \(\{ params \}\) => \(\{ notes: read\(everyNote\) \}\)/, desk)
})

test('[40-17] rename leaves a place in code as it stands and lists it, also in a file whose comment holds a quote', async (t) => {
  const { tool, made } = await tooled(t)
  await tool('write', {
    path: 'screens/count.tsx',
    text: "import { anyone, screen } from 'tentjs/ui'\nimport { allNotes } from '../functions/users'\n\n// The count of a person's notes.\nexport const countScreen = screen('countScreen', {\n  path: '/count',\n  access: anyone('the notes of a test app'),\n  view: () => <p>{typeof allNotes}</p>,\n})\n",
  })
  const renamed = Object(await tool('rename', { name: 'allNotes', to: 'everyNote' }))
  const count = fileOf(made.folder, 'screens/count.tsx')
  assert.match(count, /import \{ everyNote \} from '..\/functions\/users'/)
  // Code is never rewritten by a tool: the view is left, and its line is listed.
  assert.match(count, /view: \(\) => <p>\{typeof allNotes\}<\/p>/, count)
  assert.deepEqual(renamed.code, [{ path: 'screens/count.tsx', line: 8 }])
})
