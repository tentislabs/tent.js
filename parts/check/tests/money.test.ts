import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProject } from '../index.ts'
import { copyOf, lineWith } from './copies.ts'

const file = join('screens', 'orders.tsx')

test('[32-16] format of useTranslations with the format currency written in place, in a project that states no currency, is T6021, and one that names its currency is none', async () => {
  const folder = copyOf(join('moneyFormat', 'fail'), 'T6021-format-fail')
  const text = readFileSync(join(folder, file), 'utf8')
  const found = (await checkProject(folder)).findings.filter((one) => one.code === 'T6021')
  assert.deepEqual(
    found.map((one) => one.where?.line),
    [lineWith(text, "format(total, 'currency')"), lineWith(text, "t.format(total, { as: 'currency', digits: 0 })")],
  )
  assert.match(found[0].message, /currency/)
  assert.match(found[0].fix ?? '', /currency: 'USD'/)
})

test('[32-16] in a project that states its currency the format currency of useTranslations is no finding', async () => {
  const { findings } = await checkProject(copyOf(join('moneyFormat', 'pass'), 'T6021-format-pass'))
  assert.deepEqual(
    findings.map((one) => `${one.code} ${one.where?.file}:${one.where?.line} ${one.message}`),
    [],
  )
})

test('[32-16] money has no field of its own: useField takes no format, which the type checker refuses', async () => {
  const folder = copyOf(join('moneyFormat', 'fail'), 'T6021-format-field')
  const text = readFileSync(join(folder, file), 'utf8')
  const { findings } = await checkProject(folder)
  const refused = findings.filter((one) => one.code === 'T8000')
  assert.deepEqual(
    refused.map((one) => one.where?.line),
    [lineWith(text, "useField('total', { format: 'currency' })")],
  )
  assert.match(refused[0].message, /^TS2554: Expected 1 arguments, but got 2/)
})
