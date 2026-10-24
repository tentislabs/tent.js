import assert from 'node:assert/strict'
import { test } from 'node:test'
import { typeCheck } from './typed.ts'

const project = `import { project } from 'tentjs'

export const shop = project('shop', {})
`

test('[24-7] the flow that an incoming call starts is handed its event typed as the call: kind, id, headers, body, params and query', () => {
  const flows = `import { flow, incoming, log } from 'tentjs'

export const f = flow('f', {
  run: async ({ event }) => {
    log.info(String(event?.body))
    if (event?.kind === 'incoming') {
      const id: string | undefined = event.id
      const headers: Record<string, string> = event.headers
      const params: Record<string, string> = event.params
      const query: Record<string, string> = event.query
      return { id, headers, params, query }
    }
    return {}
  },
})

export const i = incoming('i', { path: '/hooks/i', open: 'why', then: f })
`
  assert.deepEqual(typeCheck('incoming-event', { 'tent.ts': project, 'flows.ts': flows }), [])
  const wrong = `import { flow } from 'tentjs'

export const f = flow('f', {
  run: async ({ event }) => {
    const kind: 'added' | undefined = event?.kind
    return kind
  },
})
`
  assert.deepEqual(
    typeCheck('incoming-event-wrong', { 'tent.ts': project, 'flows.ts': wrong }).map((one) => [one.file, one.line]),
    [['flows.ts', 5]],
    'the event of a flow with no trigger is no event of a table',
  )
})
