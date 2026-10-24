import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import type { Server } from './server.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const system = { as: { kind: 'system' } } as const

/** The makers of a project of these tests: a reader of texts of a kind of its own, which says which one read. */
const makers = (said: string): string =>
  `import type { Makers } from 'tentjs/engine'\n\nexport default {\n  textReaders: () => [{ kinds: ['text/x-shop'], read: async () => '${said}' }],\n} satisfies Makers\n`

const running = (server: Server): string | undefined => server.app.versions().find((one) => one.running)?.id

test('[22-23] a publish that changes engine.ts opens the app again, and calls that arrive meanwhile wait and are answered; a new version that does not open leaves the old one running', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  writeFileSync(join(here.project, 'engine.ts'), makers('first'))
  await here.save()
  const first = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(first.opens, true, 'the bundle brought by hand had no engine.ts')

  writeFileSync(join(here.project, 'engine.ts'), makers('second'))
  await here.save()
  let done = false
  const publishing = publish({ project: here.project, history: here.history, to, fetch: fetched }).finally(() => {
    done = true
  })
  const answers: Promise<string>[] = []
  while (!done) {
    answers.push(
      server.app.call('openOrders', { limit: 5 }, system).then(
        () => 'answered',
        (error: { code?: string }) => `failed ${error.code}`,
      ),
    )
    await new Promise((later) => setTimeout(later, 5))
  }
  const second = await publishing
  assert.equal(second.opens, true)
  const all = await Promise.all(answers)
  assert.ok(all.length > 0)
  assert.deepEqual(
    all.filter((one) => one !== 'answered'),
    [],
  )

  // Makers that fail to make what they make: the app is not opened again, and the old version runs.
  writeFileSync(
    join(here.project, 'engine.ts'),
    "import type { Makers } from 'tentjs/engine'\n\nexport default {\n  textReaders: () => {\n    throw new Error('these makers make nothing')\n  },\n} satisfies Makers\n",
  )
  await here.save()
  const refused = await publish({ project: here.project, history: here.history, to, fetch: fetched }).then(
    () => undefined,
    (error: { code?: string }) => error,
  )
  assert.equal(refused?.code, 'T9103')
  assert.equal(running(server), second.version)
  assert.equal(String(await server.app.call('openOrders', { limit: 5 }, system).then(() => 'answered')), 'answered')
})

test("[22-23] a program's own makers win over a bundle's: a version whose mailer fails to be made opens where the program makes its own", async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, {
    open: { makers: { mailer: () => ({ send: async () => ({ refused: [] }) }) } },
  })
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  writeFileSync(
    join(here.project, 'engine.ts'),
    "import type { Makers } from 'tentjs/engine'\n\nexport default {\n  mailer: () => {\n    throw new Error('these makers make nothing')\n  },\n} satisfies Makers\n",
  )
  await here.save()
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.equal(running(server), done.version)
  // The same version on a server whose program makes no mailer of its own: the bundle's is made, and fails.
  const other = await started(t, folderOf(t))
  const refused = await publish({
    project: here.project,
    history: here.history,
    to: other.key(['read', 'push', 'publish']),
    fetch: fetched,
  }).then(
    () => undefined,
    (error: { code?: string }) => error,
  )
  assert.equal(refused?.code, 'T9103')
})
