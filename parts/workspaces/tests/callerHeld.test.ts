import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import type { App } from '../../engine/index.ts'
import { folderOf, product } from './held.ts'
import { refusal, scripted } from './tooled.ts'
import { turned } from './turned.ts'

/** Adds a user of the product, and answers them as a caller. */
async function userOf(app: App, email: string): Promise<Caller> {
  const [row] = Object(await app.write([{ add: 'users', values: { email, roles: ['builder'] } }], { as: 'system' }))
  return { kind: 'user', user: { id: String(Object(row).id), roles: [] } }
}

test('[40-17] tool from the product own code holds its caller to the workspace: T3101 for a caller who is not its owner and whom may does not let in, as turn and undo of the program are', async (t) => {
  const made = await product(t, folderOf(t), 'builder')
  const bo = await userOf(made.app, 'bo@example.com')
  const cy = await userOf(made.app, 'cy@example.com')
  // Cy is let into every workspace by the product's own word.
  const at = await turned(t, { may: (caller) => caller.user?.id === cy.user?.id }, made)
  const read = (caller: Caller) =>
    at.workspaces.tool(at.made.id, 'read', { path: 'tent.ts' }, { caller, agent: 'builder' })
  const refused = await refusal(read(bo))
  assert.equal(refused?.code, 'T3101')
  assert.doesNotMatch(JSON.stringify(refused), /export const/)
  assert.equal((await refusal(read({ kind: 'nobody' })))?.code, 'T3101')
  assert.ok(Object(await read(at.caller)).text)
  assert.ok(Object(await read(cy)).text)
  at.app.standIn('writer', scripted([{ text: 'Done.' }]).provider)
  const turnOf = (caller: Caller) => at.workspaces.turn(at.made.id, 'builder', 'x', { caller, thread: at.thread })
  assert.equal((await refusal(turnOf(bo)))?.code, 'T3101')
  assert.deepEqual(at.workspaces.turns(at.made.id), [])
  const turn = await turnOf(at.caller)
  assert.equal(turn.state, 'done', JSON.stringify(turn))
  assert.equal((await refusal(at.workspaces.undo(at.made.id, turn.id, { caller: bo })))?.code, 'T3101')
  assert.equal(at.workspaces.turns(at.made.id)[0]?.state, 'done')
})
