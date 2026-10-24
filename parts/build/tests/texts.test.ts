import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../index.ts'
import { copyOf, errorsOf, placesOf } from './projects.ts'

test('[32-9] the build joins the language files of a project, stores each message under its names joined with dots, and writes a file of messages for each language', async () => {
  const folder = copyOf('texts/twice', 'texts-joined')
  // Without the second English file no key is given twice.
  rmSync(join(folder, 'messages', 'second.en.ts'))
  const made = await buildProject(folder, { for: 'release' })
  assert.deepEqual(errorsOf(made.findings), [])
  assert.deepEqual(made.description.messages, {
    en: { 'orders.title': 'Open orders', 'orders.empty': 'None yet' },
    tr: { 'orders.title': 'Açık siparişler', 'orders.empty': 'Henüz yok', greeting: 'Merhaba {name}' },
  })
  const files: Record<string, unknown> = Object(Object(made.description.browser).messages)
  assert.deepEqual(Object.keys(files).sort(), ['en', 'tr'])
  for (const file of Object.values(files)) assert.ok(existsSync(join(made.bundleFolder, String(file))), String(file))
})

test('[32-9] a key that two files of one language give is T1014, and a language file holds messages only', async () => {
  const twice = await buildProject(copyOf('texts/twice', 'texts-twice'), { for: 'dev' })
  assert.deepEqual(placesOf(twice.findings, 'T1014'), ['messages/second.en.ts:4'])
  assert.match(twice.findings.find((one) => one.code === 'T1014')?.message ?? '', /orders\.title/)
  const plain = await buildProject(copyOf('texts/plain', 'texts-plain'), { for: 'dev' })
  assert.deepEqual(placesOf(plain.findings, 'T1010'), ['messages/en.ts:4'])
})

test('[32-7] a screen whose path starts with the code of a language of the project is T1014', async () => {
  const made = await buildProject(copyOf('texts/coded', 'texts-coded'), { for: 'dev' })
  assert.deepEqual(placesOf(made.findings, 'T1014'), ['screens.tsx:10'])
  assert.match(made.findings.find((one) => one.code === 'T1014')?.message ?? '', /path/)
})
