import assert from 'node:assert/strict'
import test from 'node:test'
import type { Description } from '../../core/internal.ts'
import { impactOf } from '../../publish/index.ts'
import { impactShown } from '../impactShown.ts'

/** A description with the functions it is handed, every other part empty, each function at a place of its own. */
const described = (functions: Record<string, object>): Description =>
  Object({
    app: { name: 'shop' },
    project: {},
    tables: {},
    functions,
    flows: {},
    screens: {},
    components: {},
    services: {},
    models: {},
    routes: {},
    incoming: {},
    commands: {},
    messages: {},
    places: Object.fromEntries(
      Object.keys(functions).map((name) => [name, { file: `functions/${name}.ts`, from: 0, to: 10 }]),
    ),
  })
const query = (access: object): object => ({
  kind: 'query',
  form: 'plain',
  input: {},
  access,
  output: { kind: 'text' },
})
const live = described({ notes: query({ rule: 'signedIn' }) })
// The query made open to anyone, and a second one beside it.
const next = described({
  notes: query({ rule: 'anyone', why: 'a test' }),
  others: query({ rule: 'anyone', why: 'a test' }),
})

test('[44-2] in a terminal of fewer than 30 lines the impact says the counts of each part first, and its parts open one by one', async () => {
  const impact = impactOf({ against: 'live', live, next })
  const written: string[] = []
  const lines = ['', 'q']
  const text = await impactShown(impact, {
    rows: 20,
    line: async () => lines.shift(),
    write: (one) => void written.push(one),
  })
  const shown = written.join('')
  // The counts come first, then one part for the first Enter, and nothing more once the person says q.
  assert.match(shown, /^Impact against live\n\d+ wider rights, /)
  assert.ok(shown.includes('Wider rights\n'), shown)
  assert.equal(shown.includes('Tests\n'), false, shown)
  assert.equal(text, '')
  // A tall terminal is printed whole, at once.
  const whole = await impactShown(impact, { rows: 50, line: async () => undefined, write: () => undefined })
  assert.ok(whole.includes('Wider rights') && whole.includes('Tests'), whole)
})
