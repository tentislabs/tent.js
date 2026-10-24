import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import { computer, fetched, folderOf, started } from './server.ts'

// A screen kept as public that reads the user: the check warns of it (T6030), and the publish still goes.
const opened = `import { screen } from 'tentjs/ui'

export const openScreen = screen('openScreen', {
  path: '/open',
  access: 'anyone',
  cache: { for: 60_000, public: true },
  view: ({ user }) => <span>{user ? user.id : ''}</span>,
})
`

test('[44-2] the findings of the check of a publish are said as findings, apart from the impact, at try as at landing', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { project: 'desk' })
  const here = computer(t, folder, 'here', join(import.meta.dirname, 'desk'))
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  mkdirSync(join(here.project, 'screens'), { recursive: true })
  writeFileSync(join(here.project, 'screens', 'open.tsx'), opened)
  await here.save()
  const codes = (found: { code: string }[] | undefined): string[] => (found ?? []).map((one) => one.code)
  const worked = (impact: { work: { name: string; change: string }[] } | undefined): string =>
    JSON.stringify(impact?.work ?? [])
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.ok(codes(tried.findings).includes('T6030'), `try says the finding: ${codes(tried.findings).join(', ')}`)
  assert.equal(worked(tried.impact).includes('T6030'), false, `no finding is work under way: ${worked(tried.impact)}`)
  const landed = await publish({ project: here.project, history: here.history, to, fetch: fetched, acceptImpact: true })
  assert.ok(
    codes(landed.findings).includes('T6030'),
    `the landing says the finding: ${codes(landed.findings).join(', ')}`,
  )
  assert.equal(worked(landed.impact).includes('T6030'), false, `no finding is work under way: ${worked(landed.impact)}`)
})
