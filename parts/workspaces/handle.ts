import type { Caller } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { TurnOptions, Workspace, Workspaces, WorkspacesOptions } from './face.ts'
import { heldTo } from './heldTo.ts'

/** What a member of the handle is handed first by the engine: the caller of the call it is used in. */
interface Called {
  caller: Caller
}

/** A workspace as the handle answers it: without the folder it lies in on the disk of the product. */
const shown = (workspace: Workspace): Omit<Workspace, 'folder'> => {
  const { folder: _, ...rest } = workspace
  return rest
}

/**
 * Takes the workspaces and what they were made with. Answers the working object behind the handle `workspaces`
 * of the product's app, which the engine hands the caller of each call first. Every member but `create` and
 * `list` holds that caller to the workspace it names: its owner, or whoever `may` lets in, and T3101 for anyone
 * else. Each answers a promise.
 */
export function handleOf(w: Workspaces, o: WorkspacesOptions): object {
  /** The workspace of an id, held to the caller: T0001 where there is none, and T3101 for a caller that may not. */
  const held = (caller: Caller, id: unknown): Workspace => {
    const workspace = typeof id === 'string' ? w.get(id) : undefined
    if (!workspace) throw new TentError('T0001', `No workspace ${JSON.stringify(id).slice(0, 40)} is there.`)
    heldTo(o, caller, workspace)
    return workspace
  }
  return {
    create: async (_: Called, asked: { owner: string; from?: string; name?: string }) => shown(await w.create(asked)),
    get: async ({ caller }: Called, id: string) => shown(held(caller, id)),
    list: async (_: Called, asked?: { owner?: string }) => w.list(asked).map(shown),
    remove: async ({ caller }: Called, id: string) => w.remove(held(caller, id).id),
    values: async ({ caller }: Called, id: string, asked: Parameters<Workspaces['values']>[1]) =>
      w.values(held(caller, id).id, asked),
    mail: async ({ caller }: Called, id: string, asked?: { newest?: number }) => w.mail(held(caller, id).id, asked),
    publish: async ({ caller }: Called, id: string, asked?: Parameters<Workspaces['publish']>[1]) =>
      w.publish(held(caller, id).id, asked),
    tool: async ({ caller }: Called, id: string, name: string, input: object, asked: { agent: string }) =>
      w.tool(held(caller, id).id, name, input, { caller, agent: asked.agent }),
    turn: async (
      { caller }: Called,
      id: string,
      agent: string,
      message: string,
      asked: Omit<TurnOptions, 'caller'> = {},
    ) => w.turn(held(caller, id).id, agent, message, { ...asked, caller }),
    turns: async ({ caller }: Called, id: string, asked?: { newest?: number }) => w.turns(held(caller, id).id, asked),
    undo: async ({ caller }: Called, id: string, turn: string, asked?: { data?: 'back' }) =>
      w.undo(held(caller, id).id, turn, { ...(asked?.data ? { data: asked.data } : {}), caller }),
  }
}
