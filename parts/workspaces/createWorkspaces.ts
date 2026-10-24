import { rmSync } from 'node:fs'
import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { rowIds } from '../engine/index.ts'
import { copyProject } from './copied.ts'
import type { Workspace, Workspaces, WorkspacesOptions } from './face.ts'
import { foldersOf, readWorkspace, workspaceIds, writeWorkspace } from './folder.ts'
import { handleOf } from './handle.ts'
import { heldTo } from './heldTo.ts'
import { mailIn } from './mailbox.ts'
import { rebuildWorkspace, runWorkspace } from './opening.ts'
import { openLive, publishWorkspace } from './published.ts'
import { linksOf, onRequestOf } from './requests.ts'
import { projectSource, toolCalled } from './source.ts'
import type { Held, One } from './state.ts'
import { historyOf, oneOf } from './state.ts'
import { agentOf, shownOf, takeUpTurns, turnOn } from './turn.ts'
import { undoTurn } from './undo.ts'
import { valuesOf } from './values.ts'

/** Closes what is held of one workspace: its app and its live app, its box, and its history. */
async function closeOne(one: One): Promise<void> {
  await one.opening?.catch(() => undefined)
  await one.box?.stop()
  await one.app?.close()
  await one.live?.close()
  one.history?.close()
  one.app = undefined
  one.live = undefined
  one.history = undefined
}

/**
 * Makes the workspaces of a product over a folder that holds a folder for each workspace. Puts their `onRequest`
 * in front of the engine's own, gives the engine the handle `workspaces` for the product's app, and opens every
 * workspace and every live app it finds on the disk, each with its `sleepAfter`.
 */
export function createWorkspaces(o: WorkspacesOptions): Workspaces {
  const held: Held = { o, ones: new Map(), closed: false }
  /** The workspace of an id, as the workspaces hold it now: T0001 for none. */
  const need = (id: string): One => oneOf(held, id)
  /** The id of a workspace, once its caller was held to it: T0001 for none, and T3101 for a caller that may not. */
  const reached = (id: string, caller: Caller): string => {
    heldTo(o, caller, need(id).workspace)
    return id
  }
  const workspaces: Workspaces = {
    async create(asked) {
      const id = rowIds.next()
      const folders = foldersOf(o.folder, id)
      const template = asked.from === undefined ? undefined : o.templates?.[asked.from]
      const from = template ?? (asked.from === undefined ? undefined : need(asked.from).folders.project)
      if (asked.from !== undefined && !from)
        throw new TentError('T0001', `No template and no workspace ${asked.from} is there.`)
      if (from) copyProject(from, folders.project)
      const workspace: Workspace = {
        id,
        owner: asked.owner,
        ...(asked.name === undefined ? {} : { name: asked.name }),
        createdAt: Date.now(),
        folder: folders.root,
        address: o.address(id),
      }
      writeWorkspace(workspace)
      held.ones.set(id, { workspace, folders })
      return workspace
    },
    get(id) {
      try {
        return need(id).workspace
      } catch {
        return undefined
      }
    },
    list(asked = {}) {
      const all = workspaceIds(o.folder).flatMap((id) => {
        const workspace = held.ones.get(id)?.workspace ?? readWorkspace(o.folder, id, o.address)
        return workspace ? [workspace] : []
      })
      return asked.owner === undefined ? all : all.filter((one) => one.owner === asked.owner)
    },
    async remove(id) {
      const one = need(id)
      await closeOne(one)
      held.ones.delete(id)
      rmSync(one.folders.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    },
    run: async (id) => runWorkspace(held, id),
    rebuild: async (id, by) => rebuildWorkspace(held, id, by),
    history: (id) => historyOf(need(id)),
    values: async (id, asked) => valuesOf(held, id, asked),
    mail: async (id, asked = {}) => mailIn(need(id).folders.data, asked.newest),
    publish: async (id, asked) => publishWorkspace(held, id, asked),
    async tool(id, name, input, asked) {
      const record = agentOf(o.app, asked.agent)
      // The product's own code acts on its user's word: what the policy asks the person for, it has asked.
      return toolCalled(held, reached(id, asked.caller), name, input, {
        caller: asked.caller,
        record,
        by: { kind: 'tool' },
        ask: async () => true,
      })
    },
    turn: async (id, agent, message, asked) => turnOn(held, reached(id, asked.caller), agent, message, asked),
    turns: (id, asked = {}) => historyOf(need(id)).turns(asked).map(shownOf),
    undo: async (id, turn, asked) => undoTurn(held, reached(id, asked.caller), turn, asked),
    onRequest: onRequestOf(held),
    async close() {
      held.closed = true
      for (const one of held.ones.values()) await closeOne(one)
    },
  }
  o.engine.give('onRequest', 'workspaces', workspaces.onRequest)
  o.engine.give('onLink', 'workspaces', linksOf(held))
  o.engine.give('handle', 'workspaces', handleOf(workspaces, o), o.app)
  o.engine.offer('project', projectSource(held))
  // A turn tells a row that a hand changed while it built by this count, which the engine's own tables do not move.
  // A workspace that may sleep is held by the engine behind an app of its own, which answers the description of the
  // app that tells the change while it is awake.
  o.engine.on('row.changed', ({ app }) => {
    for (const one of held.ones.values())
      if (one.app?.description === app.description) one.rowsChanged = (one.rowsChanged ?? 0) + 1
  })
  // What lies on the disk is opened as the program starts: a workspace that sleeps costs no store.
  for (const id of workspaceIds(o.folder)) {
    let one: One
    try {
      one = need(id)
    } catch {
      continue
    }
    void runWorkspace(held, id).catch(() => undefined)
    if (one.workspace.live) void openLive(held, one).catch(() => undefined)
    // A turn that its row says still works is taken up where it stood.
    takeUpTurns(held, one)
  }
  return workspaces
}
