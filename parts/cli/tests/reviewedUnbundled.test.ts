import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject, buildSaved } from '../../build/index.ts'
import { copied } from './typed.ts'

// Two files of the project whose paths differ only by a dot where the other has a folder: each is a module of its
// own in development, and neither stands in for the other.
const dotted = "export const said = (): string => 'said by the dotted file'\n"
const foldered = "export const said = (): string => 'said by the file in a folder'\n"
const screenFile = `import { useState } from 'react'
import { screen } from 'tentjs/ui'
import { said as dottedSaid } from './words/a.b'
import { said as folderSaid } from './words/a/b'

export const pairScreen = screen('pairScreen', {
  path: '/pair',
  access: 'anyone',
  view: () => {
    const [shown] = useState(\`\${dottedSaid()} and \${folderSaid()}\`)
    return <span>{shown}</span>
  },
})
`

test('[31-21] in development two files whose paths differ by a dot and a folder are two modules: the build of a session builds the project that a release builds', async (t) => {
  const folder = copied(t, 'reviewed-dotted', 'devs')
  mkdirSync(join(folder, 'words', 'a'), { recursive: true })
  writeFileSync(join(folder, 'words', 'a.b.ts'), dotted)
  writeFileSync(join(folder, 'words', 'a', 'b.ts'), foldered)
  writeFileSync(join(folder, 'pair.tsx'), screenFile)
  const release = await buildProject(folder, { for: 'release', out: join(folder, '..', 'release') })
  assert.deepEqual(release.findings, [], 'a release builds the project')
  const saved = await buildSaved(folder)
  assert.deepEqual(
    saved.findings.filter((one) => one.level === 'error'),
    [],
    'the build of a session builds it too',
  )
})
