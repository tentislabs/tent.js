import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

// The attacks of the reviewer on a streamed page: what the engine keeps of a page that it streamed.

test('[31-20] a screen kept for five minutes whose page was streamed is kept whole, or not at all: the next visitor is sent the slow part too', async () => {
  const { address } = await served('streamed', {
    change: (folder) =>
      appendFileSync(
        join(folder, 'screens', 'shelf.tsx'),
        `
export const keptScreen = screen('keptScreen', {
  path: '/kept',
  access: 'anyone',
  cache: '5 minutes',
  loading: Waiting,
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span>Notes on the shelf: {notes.length}</span>
      <SlowCount />
    </main>
  ),
})
`,
      ),
  })
  const whole = async (): Promise<string> => {
    const answer = await fetch(`${address}/kept`, { headers: { accept: 'text/html' } })
    assert.equal(answer.status, 200)
    return answer.text()
  }
  assert.match(await whole(), /Counted to (<!-- -->)?6000000/, 'the first visitor is sent the slow part')
  assert.match(
    await whole(),
    /Counted to (<!-- -->)?6000000/,
    'so is the second, whom the engine may answer from what it kept',
  )
})
