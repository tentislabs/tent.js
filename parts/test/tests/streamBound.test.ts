import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Served } from './served.ts'
import { served } from './served.ts'

// Two screens that wait for a promise that never comes: one around a part of its own that waits inside a boundary
// of React's, and one whose whole view waits.
const waiting = `import { Suspense, use } from 'react'
import { screen } from 'tentjs/ui'

const never = new Promise<void>(() => {})

const Waits = () => {
  use(never)
  return <span>never drawn</span>
}

export const partWaitsScreen = screen('partWaitsScreen', {
  path: '/part-waits',
  access: 'anyone',
  title: 'A part waits',
  view: () => (
    <main style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span>Drawn around the part</span>
      <Suspense fallback={<span>The part is on its way</span>}>
        <Waits />
      </Suspense>
    </main>
  ),
})

export const allWaitsScreen = screen('allWaitsScreen', {
  path: '/all-waits',
  access: 'anyone',
  title: 'All of it waits',
  view: () => (
    <main style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Waits />
    </main>
  ),
})
`

let common: Promise<Served> | undefined
const shelf = (): Promise<Served> => {
  common ??= served('streamed', {
    change: (folder) => {
      writeFileSync(join(folder, 'screens', 'waiting.tsx'), waiting)
      const tent = join(folder, 'tent.ts')
      writeFileSync(
        tent,
        readFileSync(tent, 'utf8').replace(
          "queryTime: '60 seconds'",
          "queryTime: '60 seconds', streamTime: '2 seconds'",
        ),
      )
    },
  })
  return common
}

/** The failure that the log holds of the newest request for a screen, with whether the request is written as failed. */
function loggedOf(dataFolder: string, name: string): { ok: unknown; message: string; stack: string } {
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const row = log
      .prepare("SELECT ok, ref FROM calls WHERE kind = 'screen' AND name = ? ORDER BY rowid DESC")
      .get(name)
    const error = log.prepare('SELECT message, stack FROM errors WHERE ref = ?').get(String(row?.ref))
    return { ok: row?.ok, message: String(error?.message), stack: String(error?.stack) }
  } finally {
    log.close()
  }
}

/** The drawing of a document: what the element with the id `tent` holds. */
const drawingOf = (html: string): string =>
  /<div id="tent">([\s\S]*?)<\/div>\s*<script type="application\/json"/.exec(html)?.[1] ?? ''

test('[31-20] a draw that still waits when the time of a stream is up is ended: the page is sent with what was drawn, the part that waits is left for the browser, and the failure is logged with its trace', async () => {
  const { address, dataFolder } = await shelf()
  const from = performance.now()
  const answer = await fetch(`${address}/part-waits`, { headers: { accept: 'text/html' } })
  const html = await answer.text()
  assert.ok(performance.now() - from < 8_000, 'the answer ends soon after the time of a stream')
  assert.equal(answer.status, 200)
  assert.match(html, /Drawn around the part/)
  assert.match(html, /The part is on its way/, 'the part that waits stands as its boundary of React draws it waiting')
  assert.ok(!html.includes('Something went wrong'), 'the page is no page of the error screen')
  assert.match(html, /<\/html>\n$/)
  const logged = loggedOf(dataFolder, 'partWaitsScreen')
  assert.equal(logged.ok, 0)
  assert.match(logged.message, /time of a stream/)
  assert.match(logged.stack, /^Error: [^\n]*time of a stream[^\n]*\n\s+at /)
})

test('[31-20] a view that waits as a whole when the time of a stream is up is sent with no drawing, which the browser makes, and a page drawn whole answers so too', async () => {
  const { address, app, dataFolder } = await shelf()
  const answer = await fetch(`${address}/all-waits`, { headers: { accept: 'text/html' } })
  const html = await answer.text()
  assert.equal(answer.status, 200)
  assert.equal(drawingOf(html).trim(), '', 'nothing is drawn of a view that waited as a whole')
  assert.match(html, /id="tent-page"/)
  assert.match(loggedOf(dataFolder, 'allWaitsScreen').message, /time of a stream/)
  const whole = await app.page('/all-waits')
  assert.equal(whole.status, 200)
  assert.equal(drawingOf(whole.html).trim(), '')
})
