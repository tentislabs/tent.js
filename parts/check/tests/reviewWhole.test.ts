import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

test('[15-1] the projects of every rule of the list: the failing one gives its code and nothing else, the passing one gives nothing', async () => {
  const wrong: string[] = []
  for (const entry of list) {
    const { rule } = await entry.load()
    // A rule over the facts of a running app is held by the tests that hand it the facts.
    if (rule.needs.includes('facts')) continue
    const of = async (side: string) =>
      (await checkRules(copyOf(join(entry.name, side), `review-${entry.name.replace('/', '-')}-${side}`))).findings
    const failing = await of('fail')
    const passing = await of('pass')
    if (!failing.some((one) => one.code === rule.code))
      wrong.push(`${entry.name}: the failing project gives no ${rule.code}`)
    const others = [...new Set(failing.filter((one) => one.code !== rule.code).map((one) => one.code))]
    if (others.length) wrong.push(`${entry.name}: the failing project gives ${others.join(', ')} beside ${rule.code}`)
    const besides = [...new Set(passing.map((one) => one.code))]
    if (besides.length) wrong.push(`${entry.name}: the passing project gives ${besides.join(', ')}`)
  }
  assert.deepEqual(wrong, [])
})

test('[15-1] the passing project of every rule of the list passes the type checker too', async () => {
  const wrong: string[] = []
  for (const entry of list) {
    const copy = copyOf(join(entry.name, 'pass'), `review-${entry.name.replace('/', '-')}-pass-typed`)
    for (const one of (await checkProject(copy)).findings.filter((found) => found.code === 'T8000'))
      wrong.push(`${entry.name}: ${one.where?.file}:${one.where?.line} ${one.message}`)
  }
  assert.deepEqual(wrong, [])
})
