import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'

/** A project of one outside server that is a program, written into a folder of its own, with what its service adds. */
function programProject(as: string, more = ''): string {
  const folder = join(import.meta.dirname, '..', '..', '..', 'results', 'build', as)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'tent.ts'),
    "import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop' })\n",
  )
  writeFileSync(
    join(folder, 'services.ts'),
    `import { secret, service } from 'tentjs'\n\nexport const local = service('local', { ${more}mcp: { command: ['node', 'server.js'] } })\n`,
  )
  writeFileSync(join(folder, 'mcp.lock.json'), '{}\n')
  return folder
}

test('[25-11] `auth`, `headers` and `url` on an outside server that is a program are T1014', async () => {
  for (const [what, more] of [
    ['url', "url: 'https://tools.example/mcp', "],
    ['auth', "auth: { bearer: secret('TOOLS_KEY') }, "],
    ['headers', "headers: { 'x-team': 'one' }, "],
  ]) {
    const folder = programProject(`mcp-program-${what}`, more)
    const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
    assert.ok(
      made.findings.some((one) => one.code === 'T1014' && one.where?.file === 'services.ts'),
      `${what}: ${JSON.stringify(made.findings)}`,
    )
  }
})
