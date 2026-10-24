import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { copied, typed } from './typed.ts'

// An outside MCP server whose one tool `tent mcp approve` wrote into the lock file, with the schema of its input.
const lock = {
  calendar: {
    tools: {
      createEvent: {
        about: 'Puts a call into the calendar',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            with: { type: 'array', items: { type: 'string' } },
            minutes: { type: 'number' },
          },
          required: ['title', 'with'],
        },
        fingerprint: 'a'.repeat(64),
      },
    },
  },
}

const files: Record<string, string> = {
  'services/calendar.ts': `import { service } from 'tentjs'

export const calendar = service('calendar', { url: 'https://calendar.example.com/mcp', mcp: true })
`,
  'functions/invite.ts': `import { action, text } from 'tentjs'
import { calendar } from '../services/calendar'

export const invite = action('invite', {
  access: 'signedIn',
  input: { title: text() },
  run: async ({ input }) => {
    await calendar.createEvent({ title: input.title, with: ['ada@example.com'], minutes: 30 })
    await calendar.createEvent({ title: input.title, with: ['ada@example.com'] })
    await calendar.createEvent({ title: 1, with: [] }) // refused
    await calendar.createEvent({ with: [] }) // refused
    return 'sent'
  },
})
`,
  'mcp.lock.json': `${JSON.stringify(lock, null, 2)}\n`,
}

test('[25-20] the type list types each tool that mcp.lock.json approved as a call of its service, by the schema of its input', async (t) => {
  const folder = copied(t, 'mcp-typed')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  const checked = await typed(folder, 'check', '--json')
  const lines = files['functions/invite.ts'].split('\n')
  const refused = lines.flatMap((line, at) => (line.endsWith('// refused') ? [at + 1] : []))
  const typeFindings = (checked.answer.findings ?? []).filter((one) => one.code === 'T8000')
  assert.deepEqual(
    typeFindings.map((one) => `${one.where?.file}:${one.where?.line}`),
    refused.map((line) => `functions/invite.ts:${line}`),
    JSON.stringify(typeFindings),
  )
})
