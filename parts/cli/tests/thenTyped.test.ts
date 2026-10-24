import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { copied, typed } from './typed.ts'

// A change that states its output and fails on one path, as sample app 5 makes a bot, and a form over it whose
// `then` reads the answer.
const files: Record<string, string> = {
  'tables/bots.ts': `import { table, text } from 'tentjs'

export const bots = table('bots', { columns: { name: text() }, access: { read: 'signedIn', add: 'signedIn' } })
`,
  'functions/bots.ts': `import { change, fail, link, object, text } from 'tentjs'

export const addBot = change('addBot', {
  access: 'signedIn',
  input: { name: text({ min: 1, max: 60 }) },
  output: object({ id: link('bots'), name: text() }),
  run: ({ input, db, user }) => {
    if (!user) return fail('signed-out', 'Sign in first.')
    return db.bots.add({ name: input.name.trim() })
  },
})
`,
  'screens/make.tsx': `import { Form, screen } from 'tentjs/ui'
import { addBot } from '../functions/bots'

export const makeScreen = screen('makeScreen', {
  path: '/make',
  access: 'signedIn',
  view: () => (
    <Form
      call={addBot}
      then={(bot) => {
        const named: string = bot.name
        const wrong: number = bot.id // refused
        return { goTo: bot ? \`/bots/\${bot.id}/\${named}/\${wrong}\` : undefined }
      }}
    >
      <input name="name" />
    </Form>
  ),
})
`,
}

test("[32-2] the then of a Form is handed the answer of its change by the type of the change's output", async (t) => {
  const folder = copied(t, 'then-typed')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const checked = await typed(folder, 'check', '--json')
  const lines = files['screens/make.tsx'].split('\n')
  const refused = lines.flatMap((line, at) => (line.endsWith('// refused') ? [at + 1] : []))
  const typeFindings = (checked.answer.findings ?? []).filter((one) => one.code === 'T8000')
  assert.deepEqual(
    typeFindings.map((one) => `${one.where?.file}:${one.where?.line}`),
    refused.map((line) => `screens/make.tsx:${line}`),
    JSON.stringify(typeFindings),
  )
  assert.match(String(typeFindings[0]?.message), /'string' is not assignable to type 'number'/)
})
