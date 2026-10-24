import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { bundleOf, folderOf, shopIn } from './bundledShop.ts'
import { shell } from './typed.ts'

/** A shop whose orders are a command, built into a bundle, in a folder of its own. */
async function commanded(t: TestContext, name: string): Promise<{ folder: string; bundle: string }> {
  const folder = folderOf(t, name)
  const project = shopIn(folder, {
    files: {
      'functions/listed.ts': [
        "import { anyone, query } from 'tentjs'",
        "import { orders } from '../tables/orders.ts'",
        '',
        "export const listedOrders = query('listedOrders', {",
        "  access: anyone('the orders of the shop are listed to anyone'),",
        "  offer: ['cli'],",
        "  rows: orders.newest('createdAt').limit(5),",
        '})',
        '',
      ].join('\n'),
    },
  })
  return { folder, bundle: await bundleOf(project) }
}

/** `tent cli` with these words, as a program of its own with the install in `home`, and with nothing on its input. */
function cli(folder: string, home: string, ...words: string[]): { status: number | null; printed: string } {
  const { NODE_TEST_CONTEXT: _, ...rest } = process.env
  const ran = spawnSync(process.execPath, [shell, 'cli', ...words], {
    cwd: folder,
    encoding: 'utf8',
    input: '',
    timeout: 120_000,
    env: { ...rest, TENT_HOME: home },
  })
  return { status: ran.status, printed: ran.stdout + ran.stderr }
}

test('[24-13] the target of tent cli is also a bundle folder with --data: its commands run on that data folder', async (t) => {
  const { folder, bundle } = await commanded(t, 'cli-bundle')
  const home = join(folder, 'home')
  const ran = cli(folder, home, bundle, '--data', join(folder, 'data'), '--help')
  assert.equal(ran.status, 0, ran.printed)
  assert.match(ran.printed, /listed-orders/)
  assert.ok(existsSync(join(folder, 'data')), 'the app was opened on the data folder that --data names')
  const bare = cli(folder, home, bundle, '--help')
  assert.equal(bare.status, 2, bare.printed)
  assert.match(bare.printed, /--data/)
})
