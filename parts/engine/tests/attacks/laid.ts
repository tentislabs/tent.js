import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TestContext } from 'node:test'
import { workFolder } from '../apps.ts'

// The project that the attacks on the seam are tried on: a short `queryTime` so a query that loops is ended
// quickly, and a table the engine answers from.
const tent = `import { project } from 'tentjs'
export const attacks = project('attacks', { limits: { queryTime: '1 second' } })
`

// The actions and the query of the attack app. \`reachEngine\` walks from a callable it was handed - its own
// \`constructor\` and that constructor's - to make a function and read a marker that the test set on the engine's
// \`globalThis\`: in the test room it reaches a heap of its own, with no marker; in the program it reaches the one heap.
const ways = `import { anyone, number, query, settings, table, text } from 'tentjs'

const open = anyone('every visitor')

export const notes = table('notes', { columns: { what: text() }, access: { read: open, add: open } })

export const count = query('count', { access: open, output: number(), run: ({ db }) => db.notes.count() })

export const loops = query('loops', {
  access: open,
  output: number(),
  run: () => {
    for (;;) {
      // Never ends, on purpose: it holds the thread until the room ends the call at its time.
    }
  },
})

// A member of a handle is its own, as the program holds it: what the engine's working object inherits is no member.
export const reachThroughHandle = query('reachThroughHandle', {
  access: open,
  output: text(),
  run: () => {
    const found = Reflect.get(Object(Reflect.get(settings, 'constructor')), '__tentEngineMarker')
    return typeof found === 'string' ? found : 'not reached'
  },
})

export const reachEngine = query('reachEngine', {
  access: open,
  output: text(),
  run: ({ db }) => {
    const callable = db.notes.count
    const make = callable.constructor.constructor
    const read = make('return typeof globalThis !== "undefined" ? globalThis.__tentEngineMarker : undefined')
    const found = read()
    return typeof found === 'string' ? found : 'not reached'
  },
})
`

/** Lays the attack project into a folder of the test, with the files the test adds or changes, and answers the folder. */
export function laidAttack(t: TestContext, extra: Record<string, string> = {}): string {
  const folder = workFolder(t)
  const files: Record<string, string> = { 'tent.ts': tent, 'functions/ways.ts': ways, ...extra }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}
