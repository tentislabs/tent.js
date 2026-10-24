import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { served } from './served.ts'

/** The page record of a document. */
const recordOf = (html: string): Record<string, unknown> =>
  JSON.parse(/<script type="application\/json" id="tent-page">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}')

test('[31-4] a view that fails inside a Suspense boundary of its own is logged, and the error screen is drawn with status 500', async () => {
  const { app, dataFolder } = await served('suspended')
  const page = await app.page('/broken', { as: { kind: 'nobody' } })
  assert.equal(page.status, 500)
  assert.equal(recordOf(String(page.html)).screen, 'tent.error')
  assert.ok(!String(page.html).includes('Waiting'), 'the fallback of the boundary is not what the page answers')
  const log = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    const errors = log.prepare('SELECT message FROM errors').all()
    assert.ok(
      errors.some((one) => /broke inside its own boundary/.test(String(one.message))),
      JSON.stringify(errors),
    )
  } finally {
    log.close()
  }
})
