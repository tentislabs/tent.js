import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { errorsOf } from './projects.ts'

// The settings of TypeScript that a folder above a project holds are no part of it: a stale one there, whose
// `extends` names a file that is gone, once made every build of the projects below it fail.
const files: Record<string, string> = {
  'tsconfig.json': `${JSON.stringify({ extends: './gone/tsconfig.json' })}\n`,
  'shop/tent.ts': "import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop' })\n",
  'shop/screens/home.tsx': `import { screen } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', { path: '/', access: 'anyone', view: () => <h1>Home</h1> })
`,
  'shop/functions/count.ts': `import { action } from 'tentjs'

function twice(n: number): number {
  return n * 2
}

export const countUp = action('countUp', { access: 'anyone', run: async () => twice(2) })
`,
}

/** Lays the folder above the project and the project in it, under `results/`, and answers the two. */
function laid(t: { after(done: () => void): void }): { above: string; project: string } {
  const above = join(process.cwd(), 'results', 'build', `ownSettings-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(above, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(above, path)), { recursive: true })
    writeFileSync(join(above, path), text)
  }
  return { above, project: join(above, 'shop') }
}

for (const kind of ['release', 'dev'] as const)
  test(`[14-1] a ${kind} build of a project with no tsconfig.json of its own reads none of a folder above it, and builds with the framework's settings`, async (t) => {
    const { above, project } = laid(t)
    const made = await buildProject(project, { for: kind, out: join(above, 'bundle') })
    assert.deepEqual(errorsOf(made.findings), [])
    assert.ok(Object(made.description.browser).screens.homeScreen, 'the screen is built for a browser')
  })

test("[14-1] a build reads the project's own tsconfig.json where it has one", async (t) => {
  const { above, project } = laid(t)
  writeFileSync(join(project, 'tsconfig.json'), `${JSON.stringify({ extends: './missing.json' })}\n`)
  const made = await buildProject(project, { for: 'release', out: join(above, 'bundle') })
  // The project's own settings are read: what it names that is not there is told, and nothing of the folder above.
  const said = errorsOf(made.findings).join('\n')
  assert.match(said, /missing\.json/)
  assert.doesNotMatch(said, /gone/)
})
