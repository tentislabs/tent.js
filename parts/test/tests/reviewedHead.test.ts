import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Served } from './served.ts'
import { served } from './served.ts'

// A view that waits for a promise that never comes, as one that waits for a fetch to a host that never answers.
const waits = `import { use } from 'react'
import { screen } from 'tentjs/ui'

const never = new Promise<void>(() => {})

const Waits = () => {
  use(never)
  return <span>never drawn</span>
}

export const waitingScreen = screen('waitingScreen', {
  path: '/waits',
  access: 'anyone',
  title: 'Waits forever',
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
      writeFileSync(join(folder, 'screens', 'waits.tsx'), waits)
      // The time an answer may stay open is made short, so a page that never ends is told from one that ends late.
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

/** Reads a whole answer, and answers what came and whether it ended within the time. */
async function readWithin(answer: Response, ms: number): Promise<{ ended: boolean; text: string }> {
  const reader = answer.body?.getReader()
  assert.ok(reader)
  const words = new TextDecoder()
  let text = ''
  const end = Date.now() + ms
  for (;;) {
    const left = end - Date.now()
    if (left <= 0) {
      await reader.cancel()
      return { ended: false, text }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = await Promise.race([
      reader.read(),
      new Promise<'late'>((done) => {
        timer = setTimeout(() => done('late'), left)
      }),
    ])
    clearTimeout(timer)
    if (read === 'late') {
      await reader.cancel()
      return { ended: false, text }
    }
    if (read.done) return { ended: true, text }
    text += words.decode(read.value, { stream: true })
  }
}

test('[31-20] a view that waits for a promise that never comes does not hold the answer open for ever: the answer ends within the time of a stream', async () => {
  const { address } = await shelf()
  const answer = await fetch(`${address}/waits`, { headers: { accept: 'text/html' } })
  const read = await readWithin(answer, 10_000)
  assert.ok(read.ended, `the answer is still open after 10 seconds, with the time of a stream at 2: ${read.text}`)
  assert.match(read.text, /<\/html>\n$/)
})

test('[31-20] a view that waits for a promise that never comes does not hold a page that is drawn whole for ever', async () => {
  const { app } = await shelf()
  const drawn = await Promise.race([
    app.page('/waits').then(() => 'answered' as const),
    new Promise<'open'>((done) => setTimeout(() => done('open'), 10_000).unref()),
  ])
  assert.equal(drawn, 'answered', 'app.page still waits after 10 seconds, with the time of a stream at 2')
})
