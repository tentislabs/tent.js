import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Finding } from '../../core/index.ts'
import { checkRules } from '../ours.ts'
import { list } from '../rules/list.ts'
import { copyOf } from './copies.ts'

async function checked(rule: string, side: 'pass' | 'fail'): Promise<Finding[]> {
  const folder = copyOf(join(rule, side), `${rule.replace('/', '-')}-${side}`)
  return (await checkRules(folder)).findings
}

test('[25-4] [15-1@9b] T7004 warns of more functions offered to MCP than toolsListed, once, at the project, and a raised toolsListed passes', async () => {
  assert.ok(list.some((one) => one.name === 'T7004/toolsListed'))
  assert.deepEqual(await checked('T7004/toolsListed', 'pass'), [])
  const findings = await checked('T7004/toolsListed', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [['T7004', 'warning', 'tent.ts', 3]],
  )
  assert.match(findings[0].message, /21/)
  assert.ok(findings[0].fix)
})

test('[25-2] [15-1@9b] T7009 holds a function that is offered to MCP and states no `about`, at its line', async () => {
  assert.ok(list.some((one) => one.name === 'T7009/mcp'))
  assert.deepEqual(await checked('T7009/mcp', 'pass'), [])
  const findings = await checked('T7009/mcp', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [['T7009', 'error', 'functions/shop.ts', 12]],
  )
  assert.equal(findings[0].docs, 'tent docs T7009')
})

test('[25-6] [15-1@9b] T7004 warns of a project that offers something to MCP and has no screen at its signInPath', async () => {
  assert.ok(list.some((one) => one.name === 'T7004/signIn'))
  assert.deepEqual(await checked('T7004/signIn', 'pass'), [])
  const findings = await checked('T7004/signIn', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [['T7004', 'warning', 'tent.ts', 3]],
  )
  assert.match(findings[0].message, /\/sign-in/)
  // A project that offers its open functions to anyone lets a chat app reach them with no sign-in, so it needs no
  // screen for them; one offered function that needs a signed-in person needs the screen again.
  assert.deepEqual(await checked('T7004/signIn/open', 'pass'), [])
  assert.deepEqual(
    (await checked('T7004/signIn/open', 'fail')).map((one) => [one.code, one.level]),
    [['T7004', 'warning']],
  )
})

test('[15-1@9b] the case `grant` of T6012: a second `grant` screen, and an `ask` screen whose access is not signedIn', async () => {
  assert.ok(list.some((one) => one.name === 'T6012/grant'))
  assert.deepEqual(await checked('T6012/grant', 'pass'), [])
  const findings = await checked('T6012/grant', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.where?.file, one.where?.line]),
    [
      ['T6012', 'screens/allow.tsx', 4],
      ['T6012', 'screens/allow.tsx', 5],
    ],
  )
})

test('[25-9] [15-1@9b] T7009 holds a screen that is offered to MCP and states no `about`, at its line', async () => {
  assert.deepEqual(await checked('offeredScreen', 'pass'), [])
  const findings = await checked('offeredScreen', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [['T7009', 'error', 'screens/shop.tsx', 6]],
  )
})

test('[25-9] [15-1@9b] T7021 holds a screen in a chat that calls a function which is not offered to MCP, and warns of each thing that a frame of another site cannot have', async () => {
  assert.ok(list.some((one) => one.name === 'T7021/chat'))
  assert.deepEqual(await checked('T7021/chat', 'pass'), [])
  const findings = await checked('T7021/chat', 'fail')
  assert.deepEqual(
    findings.map((one) => [one.code, one.level, one.where?.file, one.where?.line]),
    [
      ['T7021', 'error', 'screens/orders.tsx', 8],
      ['T7021', 'warning', 'screens/orders.tsx', 8],
      ['T7021', 'warning', 'screens/orders.tsx', 8],
    ],
  )
  assert.match(findings[0].message, /addOrder/)
  assert.match(findings[1].message, /filter/)
  assert.match(findings[2].message, /unlock/)
})
