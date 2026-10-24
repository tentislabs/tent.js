import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { copyOf } from './copies.ts'

test('[15-1] the type checker reads `engine.ts` and `seed.ts` at the root of a project, as every other file of it', async () => {
  const folder = copyOf(join('T8000', 'pass'), 'T8000-root')
  writeFileSync(
    join(folder, 'engine.ts'),
    [
      "import type { Makers } from 'tentjs/engine'",
      '',
      'const steps: number = "three"',
      '',
      'export default { providers: () => ({}) } satisfies Makers',
      'export const counted = steps',
      '',
    ].join('\n'),
  )
  writeFileSync(join(folder, 'seed.ts'), ['const rows: string = 3', 'export default rows', ''].join('\n'))
  const found = (await checkProject(folder)).findings.filter((one) => one.code === 'T8000')
  assert.deepEqual(
    found.map((one) => `${one.where?.file}:${one.where?.line}`),
    ['engine.ts:3', 'seed.ts:1'],
  )
})
