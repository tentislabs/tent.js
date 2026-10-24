import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import type { Served } from './served.ts'
import { served } from './served.ts'

// Screens whose body waits for the test: a view that is held until the test lets it go, read from the program
// that serves it, so the test can read what was sent before the body was drawn.
const heads = `import './heads.css'
import { use } from 'react'
import { read, screen } from 'tentjs/ui'
import { allNotes, slowNote } from '../functions/shelf'

const held = (name: string): Promise<void> => {
  const kept: unknown = Reflect.get(globalThis, name)
  if (kept instanceof Promise) return kept
  const given = Promise.resolve()
  Reflect.set(globalThis, name, given)
  return given
}

const Held = () => {
  use(held('headHeld'))
  return <span>The body came</span>
}

const Broken = () => {
  use(held('brokenHeld'))
  throw new Error('the body broke late')
}

export const headScreen = screen('headScreen', {
  path: '/head',
  access: 'anyone',
  title: 'The head of the shelf',
  data: { notes: read(allNotes) },
  view: ({ notes }) => (
    <main style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span>{\`Notes: \${notes.length}\`}</span>
      <Held />
    </main>
  ),
})

export const brokenLateScreen = screen('brokenLateScreen', {
  path: '/broken-late',
  access: 'anyone',
  title: 'Broken late',
  view: () => (
    <main style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Broken />
    </main>
  ),
})

export const keptScreen = screen('keptScreen', {
  path: '/kept',
  access: 'anyone',
  cache: { for: '5 minutes' },
  data: { notes: read(allNotes) },
  view: ({ notes }) => <span>{\`Kept with \${notes.length}\`}</span>,
})

export const neededScreen = screen('neededScreen', {
  path: '/needed/:name',
  access: 'anyone',
  data: ({ params }) => ({ note: read(slowNote, { name: params.name, upTo: 1000 }, { needed: true }) }),
  view: ({ note }) => <span>{\`Needed \${note.name}\`}</span>,
})
`

let common: Promise<Served> | undefined
const shelf = (): Promise<Served> => {
  common ??= served('streamed', {
    change: (folder) => {
      writeFileSync(join(folder, 'screens', 'heads.tsx'), heads)
      writeFileSync(join(folder, 'screens', 'heads.css'), 'main { padding: 8px }\n')
    },
  })
  return common
}

/** A promise that the test lets go of, kept where a held view of the program reads it. */
function holding(name: string): () => void {
  let free = (): void => {}
  Reflect.set(globalThis, name, new Promise<void>((done) => (free = done)))
  return () => free()
}

/**
 * Asks for an address as a browser does, and reads what is sent until the head of the document has come. Answers the
 * status and the headers, what had come, and what reads the rest once the test lets the body be drawn.
 */
async function untilHead(
  address: string,
): Promise<{ status: number; headers: Headers; head: string; rest(): Promise<string> }> {
  const answer = await fetch(address, { headers: { accept: 'text/html' } })
  const reader = answer.body?.getReader()
  assert.ok(reader)
  const words = new TextDecoder()
  let head = ''
  while (!head.includes('</head>')) {
    const { done, value } = await reader.read()
    if (done) break
    head += words.decode(value, { stream: true })
  }
  const rest = async (): Promise<string> => {
    let text = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return text
      text += words.decode(value, { stream: true })
    }
  }
  return { status: answer.status, headers: answer.headers, head, rest }
}

test('[31-20] the head of a page goes first: its status, its title, its styles and the preloads of its files are sent before its body is drawn, and the body follows in the same answer', async () => {
  const { address } = await shelf()
  const free = holding('headHeld')
  const sent = await untilHead(`${address}/head`)
  // The body is held until the test lets it go: what came is what was sent before it was drawn.
  assert.equal(sent.status, 200)
  assert.match(sent.head, /^<!doctype html>/)
  assert.ok(sent.head.includes('<title>The head of the shelf</title>'), sent.head)
  assert.match(sent.head, /<link rel="stylesheet" href="\/_t\/b\/browser\/[^"]+\.[0-9a-f]{12}\.css">/)
  assert.match(
    sent.head,
    /<link rel="modulepreload" href="\/_t\/b\/browser\/screens\.heads\.headScreen\.[0-9a-f]{12}\.js">/,
  )
  assert.ok(!sent.head.includes('id="tent"'), 'nothing of the body was sent with the head')
  assert.equal(sent.headers.get('content-length'), null, 'the answer is sent in pieces')
  assert.match(String(sent.headers.get('content-security-policy')), /script-src/)
  free()
  const body = await sent.rest()
  const whole = sent.head + body
  assert.ok(whole.includes('Notes: 2'), whole)
  assert.ok(whole.includes('The body came'), whole)
  assert.ok(whole.includes('id="tent-page"'), whole)
  assert.match(whole, /<\/html>\n$/)
  assert.ok(!whole.includes('noindex'), 'a page that drew is no page of a failure')
})

test('[31-20] a failure while the body is drawn after the head was sent keeps the status: the error screen is drawn in its place, the failure is logged with its trace, and the page says noindex', async () => {
  const { address, dataFolder } = await shelf()
  const free = holding('brokenHeld')
  const sent = await untilHead(`${address}/broken-late`)
  assert.equal(sent.status, 200)
  assert.ok(sent.head.includes('<title>Broken late</title>'), sent.head)
  free()
  const body = await sent.rest()
  assert.ok(body.includes('<meta name="robots" content="noindex">'), body)
  assert.ok(body.includes('Something went wrong'), body)
  assert.ok(body.includes('id="tent-page"'), body)
  assert.match(body, /<\/html>\n$/)
  // The page record of the error screen tells the page code what was drawn, with the status of the failure.
  const record = JSON.parse(
    /<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(body)?.[1] ?? '',
  )
  assert.equal(record.screen, 'tent.error')
  assert.equal(record.status, 500)
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const row = log.prepare("SELECT ok, ref FROM calls WHERE kind = 'screen' AND name = 'brokenLateScreen'").get()
    assert.equal(row?.ok, 0)
    const error = log.prepare('SELECT message, stack FROM errors WHERE ref = ?').get(String(row?.ref))
    assert.match(String(error?.message), /the body broke late/)
    // The trace of the failure, as the bundle's code threw it.
    assert.match(String(error?.stack), /^Error: the body broke late\n\s+at /)
  } finally {
    log.close()
  }
})

test('[31-20] a page that is not found, or whose needed entry answers nothing, is known before its head is sent: a 404, never a 200 that says so', async () => {
  const { address } = await shelf()
  for (const path of ['/nowhere-at-all', '/needed/Nobody']) {
    const sent = await untilHead(`${address}${path}`)
    assert.equal(sent.status, 404, path)
    const whole = sent.head + (await sent.rest())
    assert.match(whole, /^<!doctype html>/, path)
  }
  const found = await untilHead(`${address}/needed/Ann`)
  assert.equal(found.status, 200)
  assert.ok((found.head + (await found.rest())).includes('Needed Ann'))
})

test('[31-20] a page kept in the cache and one asked for with no Accept of HTML are drawn whole by the same draw, and sent whole', async () => {
  const { address, app } = await shelf()
  // A kept screen, as it is drawn and kept, and as it is sent from the cache: one whole answer, of a stated size.
  const sent: string[] = []
  for (const time of ['drawn', 'kept']) {
    const answer = await fetch(`${address}/kept`, { headers: { accept: 'text/html' } })
    assert.equal(answer.status, 200, time)
    assert.notEqual(answer.headers.get('content-length'), null, `${time}: sent whole`)
    sent.push(await answer.text())
  }
  assert.ok(sent[0].includes('Kept with 2'), sent[0])
  assert.equal(sent[1], sent[0], 'the cache sends what it kept')
  // With no Accept of HTML the page is drawn whole: its head and its body are one text.
  const page = await app.page('/head')
  assert.equal(page.status, 200)
  assert.match(page.html, /^<!doctype html>[\s\S]*<\/head>\n<body>[\s\S]*The body came[\s\S]*<\/html>\n$/)
})
