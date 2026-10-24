import type { Caller, Type, WireError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'

/**
 * What the engine hands the MCP layer for one request. `call` passes steps 5 to 10 of the door as the caller, and
 * `agreed` is the text of a T7120 that comes back with a yes. `wire` is a failure as a caller is shown it, with its
 * status, and `limit` a limit of the project. `listen` answers the kept stream of a caller, where the project
 * keeps one, and `answered` hands on what a client answered to a request that was sent it down that stream.
 */
export interface McpEnv {
  description(): Description
  // `refused`: the person said no to what `agreed` names, the call or the ask of its run.
  call(name: string, input: unknown, caller: Caller, o?: { agreed?: string; refused?: true }): Promise<unknown>
  wire(error: unknown): { status: number; error: WireError }
  limit(name: string): number
  // A word of the project's texts in the language the client asks for, with its places filled.
  word?(key: string, filled: Record<string, string>): string
  // A request to the client down its kept stream, which answers the client's answer, or nothing with no stream.
  askOver?(caller: Caller, method: string, params: object): Promise<unknown>
  // The pictures and sounds of `mcp.inline` or less, of the files an answer names that the caller may have.
  inline?(ids: string[], caller: Caller): Promise<{ kind: string; bytes: Uint8Array }[]>
  listen?(caller: Caller): Promise<Response>
  answered?(caller: Caller, message: Record<string, unknown>): void
  // The screens that are offered to MCP, each with the address of its file in the client's language and its input.
  screens?(): ChatScreen[]
  // The file of a screen by its address, with the app's address written into it, and the hosts it loads from.
  screenFile?(uri: string): { text: string; hosts: string[] } | undefined
  // What a screen's tool answers a caller: the record of its page, the pass of its frame, and how often it asks again.
  screen?(name: string, input: unknown, caller: Caller): Promise<{ page: object; pass?: string; frame: object }>
}

/** A screen that is offered to MCP: its name, the address of its file, its `about`, and its input as types are stored. */
export interface ChatScreen {
  name: string
  uri: string
  about: string
  input: Record<string, unknown>
}

/** A tool of an outside server, as it lists it. */
export interface OutsideTool {
  name: string
  about: string
  schema: object
}

/** A tool that is no function of an app, as `tent mcp` offers the commands of the project. */
export interface LocalTool {
  name: string
  title: string
  about: string
  input: Record<string, Type>
  reads: boolean
  run(input: unknown): Promise<unknown>
}
