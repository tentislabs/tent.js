import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

/** The names of the changes whose plans the page of an address is handed, to show them before they are answered. */
async function plannedAt(address: string): Promise<string[]> {
  const html = await (await fetch(address)).text()
  const at = html.indexOf('"plans":')
  if (at < 0) return []
  const changes = /"changes":\{(.*?)\},"queries"/s.exec(html.slice(at))?.[1] ?? ''
  return [...changes.matchAll(/"([A-Za-z0-9_]+)":\{"writes"/g)].map((one) => String(one[1]))
}

// A flow that each added row of `todos` sets off, whose code may send anything out: the change that adds one now sends
// data out.
const flows = `import { flow } from 'tentjs'
import { todos } from './functions'

export const tellOthers = flow('tellOthers', {
  on: todos.added(),
  run: async () => {
    await fetch('https://example.com/told')
  },
})
`

test('[44-8] a change that sends data out, as one whose write sets off a flow that sends, shows nothing ahead', async () => {
  const plain = await served('optimistic', { for: 'dev' })
  assert.ok(
    (await plannedAt(`${plain.address}/todos`)).includes('addTodo'),
    'addTodo is shown ahead where it sends nothing',
  )
  const sending = await served('optimistic', {
    for: 'dev',
    change: (folder) => writeFileSync(join(folder, 'flows.ts'), flows),
  })
  const planned = await plannedAt(`${sending.address}/todos`)
  assert.ok(planned.includes('finish'), `the page is handed plans: ${planned.join(', ')}`)
  assert.equal(planned.includes('addTodo'), false, 'a change that sends data out is not shown ahead')
})
