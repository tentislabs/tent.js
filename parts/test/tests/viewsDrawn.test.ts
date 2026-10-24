import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { served } from './served.ts'

// The module of a view is loaded when a page first draws it, and not with the version that holds it.

/** A screen whose module counts each time it is loaded, under a name of its own. */
const counted = (name: string, path: string) => `import { useState } from 'react'
import { screen } from 'tentjs/ui'

Reflect.set(globalThis, '${name}', Number(Reflect.get(globalThis, '${name}') ?? 0) + 1)

export const ${name}Screen = screen('${name}Screen', {
  path: '${path}',
  access: 'anyone',
  view: () => {
    const [said] = useState('${name} drawn')
    return <span>{said}</span>
  },
})
`

const loads = (name: string): number => Number(Reflect.get(globalThis, name) ?? 0)

test('[31-21] the module of a view is loaded when a page first draws it, once, and the first page of a version loads none of the views it does not draw', async () => {
  const { address } = await served('streamed', {
    change: (folder) => {
      writeFileSync(join(folder, 'screens', 'lazyOne.tsx'), counted('lazyOne', '/lazy-one'))
      writeFileSync(join(folder, 'screens', 'lazyTwo.tsx'), counted('lazyTwo', '/lazy-two'))
    },
  })
  // The build ran the screen files: what counts is what the engine loads from here on.
  Reflect.set(globalThis, 'lazyOne', 0)
  Reflect.set(globalThis, 'lazyTwo', 0)
  const page = async (path: string): Promise<string> =>
    (await fetch(`${address}${path}`, { headers: { accept: 'text/html' } })).text()
  // A screen whose view is in a file it shares draws no other view, and loads none.
  await page('/public')
  assert.deepEqual([loads('lazyOne'), loads('lazyTwo')], [0, 0], 'the first page of the version loads no view')
  assert.match(await page('/lazy-one'), /lazyOne drawn/)
  assert.deepEqual([loads('lazyOne'), loads('lazyTwo')], [1, 0], 'a page loads the view it draws alone')
  assert.match(await page('/lazy-two'), /lazyTwo drawn/)
  assert.match(await page('/lazy-one'), /lazyOne drawn/)
  assert.deepEqual([loads('lazyOne'), loads('lazyTwo')], [1, 1], 'each view is loaded once')
})
