import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

// A screen whose module fails when the engine loads it, once the test says so: the build runs the screen file
// before, and must not fail.
const failing = `import { useState } from 'react'
import { screen } from 'tentjs/ui'

if (Reflect.get(globalThis, 'reviewedLoadFails') === true) throw new Error('the module of the view failed to load')

export const failingLoadScreen = screen('failingLoadScreen', {
  path: '/failing-load',
  access: 'anyone',
  view: () => {
    const [said] = useState('never drawn')
    return <span>{said}</span>
  },
})
`

const standing = `import { useState } from 'react'
import { screen } from 'tentjs/ui'

export const standingScreen = screen('standingScreen', {
  path: '/standing',
  access: 'anyone',
  view: () => {
    const [said] = useState('the standing screen')
    return <span>{said}</span>
  },
})
`

test('[31-4] a view whose module fails when it is loaded, once a page first draws it, is a page of the error screen with 500, and every other page is drawn', async () => {
  const { address } = await served('streamed', {
    change: (folder) => {
      writeFileSync(join(folder, 'screens', 'failingLoad.tsx'), failing)
      writeFileSync(join(folder, 'screens', 'standing.tsx'), standing)
    },
  })
  Reflect.set(globalThis, 'reviewedLoadFails', true)
  try {
    const failed = await fetch(`${address}/failing-load`, { headers: { accept: 'text/html' } })
    const text = await failed.text()
    assert.equal(failed.status, 500, text)
    assert.match(text, /<\/html>\n$/, 'a whole document, the error screen')
    const other = await fetch(`${address}/standing`, { headers: { accept: 'text/html' } })
    assert.equal(other.status, 200)
    assert.match(await other.text(), /the standing screen/)
  } finally {
    Reflect.set(globalThis, 'reviewedLoadFails', false)
  }
})
