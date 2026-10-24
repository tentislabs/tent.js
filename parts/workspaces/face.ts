import type { GuardedFetch } from '../connect/index.ts'
import type { Caller, Finding, TurnShown, WorkspaceShown } from '../core/index.ts'
import type { App, Engine, Identify, Makers, Sandbox } from '../engine/index.ts'
import type { History, Point, Writer } from '../history/index.ts'
import type { Published, Target } from '../publish/index.ts'

/** One workspace: one person's project inside a product, with the folder that holds it. */
export interface Workspace extends WorkspaceShown {
  folder: string
}

/** One turn of an agent that builds. */
export type Turn = TurnShown

/** Where the live app of a workspace stands: in the product's own engine, or on a far server. */
export type Live = { dataFolder: string; address: string; sleepAfter?: string } | Target

/** What `createWorkspaces` takes. */
export interface WorkspacesOptions {
  engine: Engine
  // The product's own app: the one whose users own the workspaces and whose agent builds.
  app: App
  // The folder that holds a folder for each workspace.
  folder: string
  // The address at which the app of a workspace answers.
  address: (id: string) => string
  fetch: GuardedFetch
  // Where a workspace is made live by `publish`.
  live?: (id: string) => Live
  // The template projects, each by its name, as a folder.
  templates?: Record<string, string>
  identify?: Identify
  sleepAfter?: string
  turnsKept?: number
  framedBy?: string[]
  // Where the code of a workspace of anyone else is built, and the room its app is run in, in the product's engine.
  sandbox?: Sandbox
  room?: Makers['room']
  // The roles of the product whose holders' workspaces may hold code that is built and run in the engine itself.
  trusted?: string[]
  mail?: boolean
  counting?: {
    countBy?: 'app' | 'caller'
    countEvery?: string
    levelEvery?: string
    callerCountsKept?: string
    countsKept?: string
  }
  // Lets a caller who is not the owner into a workspace.
  may?: (caller: Caller, workspace: Workspace) => boolean
}

/** What a value of a side of a workspace is asked: set, removed or listed. */
export interface ValuesAsked {
  side: 'test' | 'live'
  kind: 'secret' | 'setting'
  name?: string
  value?: string
  remove?: true
  list?: true
}

/** What a turn takes beside its workspace, its agent and its message. */
export interface TurnOptions {
  caller: Caller
  budget?: Record<string, number>
  thread?: string
  rounds?: number
  at?: { screen: string; place?: { file: string; from: number; to: number } }
  wait?: boolean
  then?: 'wait' | 'refuse' | 'stop'
}

/** The workspaces of a product. */
export interface Workspaces {
  create(o: { owner: string; from?: string; name?: string }): Promise<Workspace>
  get(id: string): Workspace | undefined
  list(o?: { owner?: string }): Workspace[]
  remove(id: string): Promise<void>
  run(id: string): Promise<App>
  rebuild(id: string, by: Writer): Promise<{ version?: string; findings: Finding[]; point: Point }>
  history(id: string): History
  values(id: string, o: ValuesAsked): Promise<string[] | undefined>
  mail(id: string, o?: { newest?: number }): Promise<object[]>
  // `acceptImpact` is the person's word on an impact that widens rights or breaks callers outside, which the product
  // asked them for: left out, such a publish is refused, so that a script cannot land either unread.
  publish(
    id: string,
    o?: { try?: boolean; back?: boolean; stopRuns?: boolean; acceptImpact?: boolean },
  ): Promise<Published>
  tool(id: string, name: string, input: object, o: { caller: Caller; agent: string }): Promise<unknown>
  turn(id: string, agent: string, message: string, o: TurnOptions): Promise<Turn>
  turns(id: string, o?: { newest?: number }): Turn[]
  undo(
    id: string,
    turn: string,
    o: { caller: Caller; data?: 'back' },
  ): Promise<{ changes: Turn['changes']; data: 'back' | 'kept'; kept: string[] }>
  onRequest: (request: Request, next: (r: Request) => Promise<Response>, about: object) => Promise<Response>
  close(): Promise<void>
}
