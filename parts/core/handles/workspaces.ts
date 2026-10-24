import type { Finding } from '../errors.ts'
import { member } from '../handle.ts'

/** One workspace, as the handle answers it: one person's project inside a product. */
export interface WorkspaceShown {
  id: string
  owner: string
  name?: string
  createdAt: number
  address: string
  live?: { version: string; address: string }
}

/** One change of a turn, in the terms of compare: what was added, removed, renamed or changed. */
export interface TurnChange {
  change: 'added' | 'removed' | 'renamed' | 'changed'
  what: string
  name: string
  was?: string
  path?: (string | number)[]
  from?: unknown
  to?: unknown
  lines?: number
}

/** One turn of an agent that builds, as the handle answers it. */
export interface TurnShown {
  id: string
  state: 'working' | 'done' | 'stopped' | 'undone'
  run?: string
  changes: TurnChange[]
  findings: Finding[]
  used: Record<string, number>
  rounds: number
  stopped?: 'budget' | 'rounds' | 'refused' | 'person'
}

/**
 * The handle of the workspaces of a product, in an app that a program gave workspaces. Every member answers a
 * promise, is full access, and holds the caller of the call to the workspace it names, but for `create` and `list`.
 */
interface Workspaces {
  create(o: { owner: string; from?: string; name?: string }): Promise<WorkspaceShown>
  get(id: string): Promise<WorkspaceShown | undefined>
  list(o?: { owner?: string }): Promise<WorkspaceShown[]>
  remove(id: string): Promise<void>
  values(
    id: string,
    o: {
      side: 'test' | 'live'
      kind: 'secret' | 'setting'
      name?: string
      value?: string
      remove?: true
      list?: true
    },
  ): Promise<string[] | undefined>
  mail(id: string, o?: { newest?: number }): Promise<object[]>
  publish(id: string, o?: { try?: boolean; back?: boolean; stopRuns?: boolean }): Promise<object>
  tool(id: string, name: string, input: object, o: { agent: string }): Promise<unknown>
  turn(
    id: string,
    agent: string,
    message: string,
    o?: {
      budget?: Record<string, number>
      thread?: string
      rounds?: number
      at?: { screen: string; place?: { file: string; from: number; to: number } }
      wait?: boolean
      then?: 'wait' | 'refuse' | 'stop'
    },
  ): Promise<TurnShown>
  turns(id: string, o?: { newest?: number }): Promise<TurnShown[]>
  undo(
    id: string,
    turn: string,
    o?: { data?: 'back' },
  ): Promise<{ changes: TurnChange[]; data: 'back' | 'kept'; kept: string[] }>
}

export const workspaces: Workspaces = {
  create: member('workspaces', 'create'),
  get: member('workspaces', 'get'),
  list: member('workspaces', 'list'),
  remove: member('workspaces', 'remove'),
  values: member('workspaces', 'values'),
  mail: member('workspaces', 'mail'),
  publish: member('workspaces', 'publish'),
  tool: member('workspaces', 'tool'),
  turn: member('workspaces', 'turn'),
  turns: member('workspaces', 'turns'),
  undo: member('workspaces', 'undo'),
}
