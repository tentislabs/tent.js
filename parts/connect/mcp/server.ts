import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { answerOf, isStored } from '../../core/internal.ts'
import type { ToolAnswer } from './answer.ts'
import { answered, failed } from './answer.ts'
import { calledAsking } from './asking.ts'
import { callOf, fitsCalled, found, pair, pairListed, toolsListedOf } from './pair.ts'
import type { LocalTool, McpEnv } from './env.ts'
import { helloOf } from './hello.ts'
import { filesIn, partOf } from './inline.ts'
import { listedOf } from './listed.ts'
import { localAnswer } from './local.ts'
import type { Offered } from './offered.ts'
import { covers, listedTo, mcpOf, offeredToMcp, onlyReads, openToAnyone } from './offered.ts'
import type { McpRequest } from './reading.ts'
import { readMessage } from './reading.ts'
import { screenAnswered, screenFileRead, screenFiles, screenListed } from './screens.ts'
import { failures, methods, newest } from './standard.ts'

/** What answers `/mcp` for one request. */
export interface McpServer {
  handle(request: Request, o: { caller: Caller; origin: string }): Promise<Response>
  // The same reading and answering with no web around it, for tools that are no functions of an app.
  message(message: object, tools: LocalTool[]): Promise<object | undefined>
}

/** An answer of JSON with a status and more lines. */
const json = (status: number, body: unknown, lines: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...lines },
  })

/** The answer of a request by its id: what it gives, or a failure of the standard with its number. */
const result = (id: unknown, value: unknown, lines: Record<string, string> = {}): Response =>
  json(200, { jsonrpc: '2.0', id, result: value }, lines)

const failure = (status: number, id: unknown, code: number, message: string, data?: unknown): Response =>
  json(status, { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } })

/** Thrown inside the handling of a request where its answer is a whole response of its own, as a 401 or a 403. */
class Answered extends Error {
  readonly response: Response
  constructor(response: Response) {
    super('answered')
    this.response = response
  }
}

/**
 * Takes what the engine hands the layer. Answers `/mcp`: the request that tells what the server is, the opening of
 * an older form and its sign of life, the list of tools and their calls, a kept stream where the project keeps one,
 * the methods that `mcp.on` names, the tool and the file of each screen that is offered, and every other method as
 * not known. Each request stands alone: the layer keeps nothing between two of them.
 */
export function mcpServer(env: McpEnv): McpServer {
  return {
    message: (message, tools) => localAnswer(message, tools, env.description().app.name),
    async handle(request, { caller, origin }) {
      const description = env.description()
      const project = mcpOf(description)
      const screens = env.screens?.() ?? []
      const told = (error: unknown): ReturnType<McpEnv['wire']> => env.wire(error)
      // Where the sign-in is described, which a client that names no caller is pointed to.
      const pointer = `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`
      const unsigned = (): Answered => {
        const { status, error } = told(new TentError('T0006', 'A request of MCP names no caller.'))
        return new Answered(json(status, { ok: false, error }, { 'www-authenticate': pointer }))
      }
      if (request.method === 'GET') {
        if (project.stream === true && caller.kind !== 'nobody' && env.listen) return env.listen(caller)
        return json(405, { ok: false }, { allow: 'POST' })
      }
      if (request.method !== 'POST') return json(405, { ok: false }, { allow: 'POST' })
      let read: McpRequest
      try {
        read = readMessage(await request.text(), request.headers)
      } catch (error) {
        const { status, error: sent } = told(error)
        return failure(status, null, failures.request, sent.message, sent)
      }
      const { message } = read
      const id = message.id
      try {
        // An answer of the client to a request that the layer sent it down a kept stream.
        if (message.method === undefined && id !== undefined && ('result' in message || 'error' in message)) {
          env.answered?.(caller, message)
          return new Response(null, { status: 202 })
        }
        if (caller.kind === 'nobody' && project.anyone !== true) throw unsigned()
        if (typeof message.method !== 'string') return failure(400, id, failures.request, 'A message names its method.')
        if (id === undefined) return new Response(null, { status: 202 })
        const params = isStored(message.params) ? message.params : {}
        const method = message.method
        if (method === methods.open || method === methods.discover)
          return result(id, helloOf(description, method === methods.discover ? newest : read.version))
        if (method === methods.alive) return result(id, {})
        if (method === methods.list) {
          // Without a stream that tells when the tools change, the list says how long it may be kept, for this caller.
          const kept: Record<string, string> =
            project.stream === true ? {} : { 'cache-control': `private, max-age=${env.limit('toolsKept') / 1000}` }
          return result(id, { tools: [...toolsOf(description, caller), ...screens.map(screenListed)] }, kept)
        }
        if (method === methods.call) return result(id, await called(params))
        // The file of each screen that is offered is read as the standard reads what a server offers to be read.
        if (method === methods.resources && screens.length) return result(id, screenFiles(screens))
        if (method === methods.read && screens.length) {
          const read = typeof params.uri === 'string' ? screenFileRead(env, params.uri) : undefined
          if (read) return result(id, read)
          return failure(200, id, failures.resource, 'No file of a screen is read under that address.')
        }
        if (method === methods.listen && project.stream === true && caller.kind !== 'nobody' && env.listen)
          return env.listen(caller)
        const on = isStored(project.on) ? project.on[method] : undefined
        // What a function of `mcp.on` answers is the answer of the method; a refusal is the answer of a tool.
        if (typeof on === 'string')
          try {
            return result(id, await env.call(on, { params }, caller))
          } catch (error) {
            return result(id, failed(told(error).error))
          }
        return failure(200, id, failures.method, `The method ${JSON.stringify(method).slice(0, 80)} is not known.`)
      } catch (error) {
        if (error instanceof Answered) return error.response
        throw error
      }

      /** Calls through the door, and answers the value as the answer of a tool, or the failure as one. */
      async function reached(call: () => Promise<unknown>): Promise<ToolAnswer> {
        try {
          return answered(await call())
        } catch (error) {
          return failed(told(error).error)
        }
      }

      /** A call of a tool: by its name, or through the pair above `toolsListed`. */
      async function called(params: Record<string, unknown>): Promise<ToolAnswer | Record<string, unknown>> {
        if (typeof params.name !== 'string') return failed(told(missing('A call of a tool names the tool.')).error)
        const input = params.arguments ?? {}
        // A screen's tool is listed whatever `toolsListed` says, and is found before the pair.
        if (screens.some((one) => one.name === params.name)) return screenAnswered(env, params.name, input, caller)
        const above = listedTo(description, caller).length > toolsListedOf(description)
        if (above && params.name === pair.find) return reached(async () => found(description, caller, input))
        if (above && params.name === pair.call) {
          let asked: { name: string; input: unknown }
          try {
            asked = callOf(input)
          } catch (error) {
            return failed(told(error).error)
          }
          return named(asked.name, asked.input, params, true)
        }
        return named(params.name, input, params, false)
      }

      /** A call of the tool of one offered function, through the door as the caller, or through `callFunction`. */
      async function named(
        tool: string,
        input: unknown,
        params: Record<string, unknown>,
        paired: boolean,
      ): Promise<ToolAnswer | Record<string, unknown>> {
        const one = offeredToMcp(description).find((offered) => offered.tool === tool)
        if (!one) return failed(told(notFound(tool)).error)
        if (caller.kind === 'nobody' && !openToAnyone(one.record.access)) throw unsigned()
        if (caller.kind === 'mcp' && !covers(description, caller, one)) throw new Answered(outsideScope(one))
        try {
          if (paired) fitsCalled(description, one, input)
          const done = await calledAsking(env, { one, input, caller, params, read })
          if ('more' in done) return done.more
          const { value } = done
          const answer = answered(value)
          // A picture or a sound that the answer names travels with it, where the caller may have it.
          const ids = filesIn(answerOf(description, one.name), value)
          if (ids.length && env.inline) answer.content.push(...(await env.inline(ids, caller)).map(partOf))
          return answer
        } catch (error) {
          return failed(told(error).error)
        }
      }

      /** The 403 of a token whose scopes do not cover a function, with the line that names the scope it lacks. */
      function outsideScope(one: Offered): Response {
        const scope = onlyReads(one) ? 'read' : 'write'
        const { status, error } = told(
          new TentError('T3101', `${one.tool} is outside the scopes that the person granted.`, {
            fix: `Ask the person for the scope \`${scope}\`.`,
          }),
        )
        const line = `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`
        return json(status, { ok: false, error }, { 'www-authenticate': line })
      }
    },
  }

  /** The tools a caller is listed: each that is offered and covered, or the pair where they are more than `toolsListed`. */
  function toolsOf(description: Description, caller: Caller): object[] {
    const listed = listedTo(description, caller)
    if (listed.length <= toolsListedOf(description)) return listed.map((one) => listedOf(description, one))
    // A caller who may only read is one whose grant holds `read` alone.
    const reads =
      caller.kind === 'mcp' && caller.grant !== undefined && caller.grant.scopes.every((one) => one === 'read')
    return pairListed(reads)
  }
}

/** The failure of a name that no tool answers to. */
const notFound = (tool: string): TentError =>
  new TentError('T0001', `No tool named ${JSON.stringify(tool).slice(0, 80)} is offered.`, {
    fix: 'Call a tool that the list names, or one that findFunction answered.',
  })

const missing = (message: string): TentError =>
  new TentError('T0002', message, { fix: 'Name the tool in `name`, and its input in `arguments`.' })
