import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { keptAlone } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { closing, copyOf, tempOf } from './projects.ts'

test("[17-1] app.worker with secretKey holds the writer's key of the secrets as its own key file, which only the current user may read", async (t) => {
  const temp = tempOf(t)
  const app = await testApp({ folder: copyOf(t, 'vaulted'), secrets: { API_KEY: 'the-key-of-the-test' } })
  closing(t, () => app.close())
  const home = join(temp, String(readdirSync(temp).find((one) => one.startsWith('tent-test-'))))
  const key = readFileSync(join(home, 'data', 'secret.key'), 'utf8')
  await app.worker({ kinds: ['any'], secretKey: key })
  const kept = join(home, 'worker-1', 'secret.key')
  assert.equal(readFileSync(kept, 'utf8'), key)
  assert.equal(keptAlone(kept).why, undefined)
})
