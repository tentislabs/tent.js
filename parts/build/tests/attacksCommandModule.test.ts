import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'

// A text that the backend file alone holds, in the code of a function and in a value it keeps to itself.
const marker = 'the-marker-of-the-backend-4711'
const kept = 'sk_live_the_secret_of_the_backend_4711'

const files: Record<string, string> = {
  'tent.ts': "import { project } from 'tentjs'\nexport const shop = project('shop', { title: 'Shop' })\n",
  'package.json': `${JSON.stringify({ name: 'shop', private: true, type: 'module' })}\n`,
  'functions/orders.ts': `import { query, text } from 'tentjs'

const key = '${kept}'

export const openOrders = query('openOrders', {
  about: 'The open orders',
  access: 'signedIn',
  offer: ['cli'],
  input: {},
  output: text(),
  run: () => ['${marker}', key.length].join(' '),
})
`,
  'commands/pay.ts': `import { command } from 'tentjs/cli'
import { openOrders } from '../functions/orders'

export const pay = command('pay', {
  about: 'Reads the open orders',
  run: async ({ read, terminal }) => {
    terminal.write(String(await read(openOrders, {})))
  },
})
`,
}

/** Every file under a folder, with its path. */
function filesUnder(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

test('[05-12.3] the module of a command, searched for a marker text of the backend file it imports and for a secret that file keeps, holds neither', async (t) => {
  const folder = join(process.cwd(), 'results', 'build', `commandModule-${Math.random().toString(36).slice(2)}`)
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  for (const how of ['dev', 'release'] as const) {
    const built = await buildProject(folder, { for: how })
    assert.deepEqual(
      built.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    const cli = join(built.bundleFolder, 'cli')
    assert.ok(existsSync(cli), `the ${how} build wrote the modules of its commands`)
    const modules = filesUnder(cli)
    assert.ok(modules.length > 0, `the ${how} build wrote a module of the command`)
    for (const one of modules) {
      const text = readFileSync(one, 'utf8')
      assert.equal(text.includes(marker), false, `${one} holds the marker text of the backend file`)
      assert.equal(text.includes(kept), false, `${one} holds the secret of the backend file`)
    }
    // The module names what it reads by its name, as a stub: the call is made by the app.
    assert.ok(
      modules.some((one) => readFileSync(one, 'utf8').includes('openOrders')),
      'the module names what it reads',
    )
  }
})
