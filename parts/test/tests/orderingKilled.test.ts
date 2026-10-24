import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import { testSecrets } from '../secrets.ts'
import { copyOf } from './projects.ts'
import type { Remote } from './remotes.ts'
import { answerJson, remoteOf } from './remotes.ts'

const steps = ['find customer', 'tell sales', 'wait', 'follow up']

/** The bundle of the project of the big order: as it is written, or with the flow made code by one harmless call. */
async function bundleOf(t: TestContext, remote: Remote, code: boolean): Promise<{ bundle: string; folder: string }> {
  const folder = copyOf(t, 'ordering')
  for (const name of ['slack.ts', 'bigOrder.ts']) {
    const file = join(folder, name)
    let text = readFileSync(file, 'utf8').split('http://127.0.0.1:1').join(remote.origin)
    if (code && name === 'bigOrder.ts')
      text = text
        .replace('export const bigOrder', 'const harmless = (n: number): number => n\n\nexport const bigOrder')
        .replace('if (!customer) return', 'if (!customer || harmless(1) !== 1) return')
    writeFileSync(file, text)
  }
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.equal(made.description.flows.bigOrder.form, code ? 'code' : 'plain')
  testSecrets(join(folder, 'data'), made.description, {})
  return { bundle: made.bundleFolder, folder }
}

/** Carries the big order out, killed after a step, and answers what the run left and what it sent out. */
async function killedAfter(t: TestContext, code: boolean, step: string) {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, { ok: true }))
  const { bundle, folder } = await bundleOf(t, remote, code)
  const mailFile = join(folder, 'mail.jsonl')
  const killed = await runKilled(join(import.meta.dirname, 'ordering', 'run.ts'), {
    times: 1,
    when: `step done ${step}`,
    args: [bundle, join(folder, 'data'), mailFile],
  })
  assert.equal(killed.kills, 1)
  const [second] = killed.ended
  assert.equal(second.code, 0, second.out)
  const found = /^ended: (.*)$/m.exec(second.out)
  assert.ok(found, second.out)
  return {
    ended: JSON.parse(found[1]),
    slack: remote.heard.map((one) => [one.path, JSON.parse(one.body.toString('utf8'))]),
    mail: existsSync(mailFile)
      ? readFileSync(mailFile, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [],
  }
}

test('[23-12] `bigOrder` read and stored, and the same flow made code by one harmless call, leave the same rows and send the same outside calls, also across a kill after each step', async (t) => {
  for (const step of steps) {
    const plain = await killedAfter(t, false, step)
    const code = await killedAfter(t, true, step)
    assert.deepEqual(code, plain, `killed after the step ${step}`)
    assert.equal(plain.ended.state, 'done')
    assert.deepEqual(
      plain.ended.steps,
      steps.map((name) => `${name}:done`),
    )
    assert.deepEqual(plain.ended.rows, { customers: [['Ada', 'ada@example.com']], orders: [2000] })
    assert.deepEqual(plain.slack, [['/chat.postMessage', { channel: '#sales', text: 'Big order from Ada' }]])
    assert.deepEqual(plain.mail, [
      { to: [{ address: 'ada@example.com' }], subject: 'How was your order?', text: 'Tell us how it went.' },
    ])
  }
})
