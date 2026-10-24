import type { WireError } from '../../core/index.ts'
import { object, TentError } from '../../core/index.ts'
import { coreVersion, isStored, toJsonSchema } from '../../core/internal.ts'
import type { ToolAnswer } from './answer.ts'
import { answered, failed } from './answer.ts'
import type { LocalTool } from './env.ts'
import { readMessage } from './reading.ts'
import { failures, methods, newest, older } from './standard.ts'

/** A failure as a caller is shown it: its code, the short word of the code, its message and its fix. */
function failureShown(thrown: unknown): WireError {
  const error =
    thrown instanceof TentError
      ? thrown
      : new TentError('T0009', thrown instanceof Error ? thrown.message : String(thrown))
  return {
    code: error.code,
    name: error.name,
    message: error.message,
    ...(error.fix === undefined ? {} : { fix: error.fix }),
    ...(error.fields === undefined ? {} : { fields: error.fields }),
  }
}

/** The tool of a local tool, as the list of the standard holds it, marked by whether it only reads. */
const listedOf = (tool: LocalTool): object => ({
  name: tool.name,
  title: tool.title,
  description: tool.about,
  inputSchema: toJsonSchema(object(tool.input)),
  annotations: { readOnlyHint: tool.reads, ...(tool.reads ? {} : { destructiveHint: false }), openWorldHint: false },
})

/** Carries out the call of a local tool: its answer as the standard's typed answer, or its failure as one. */
async function called(tools: LocalTool[], params: Record<string, unknown>): Promise<ToolAnswer> {
  const tool = tools.find((one) => one.name === params.name)
  if (!tool)
    return failed(
      failureShown(new TentError('T0001', `No tool named ${JSON.stringify(params.name).slice(0, 80)} is offered.`)),
    )
  try {
    return answered(await tool.run(isStored(params.arguments) ? params.arguments : {}))
  } catch (error) {
    return failed(failureShown(error))
  }
}

/**
 * Takes one message of the standard, the tools that are no functions of an app, and the name of the server.
 * Answers the answer, or nothing for a note, which is answered with nothing: the opening of an older form and the
 * request that tells what the server is, the sign of life, the list of the tools and their calls, and every other
 * method as not known. It keeps nothing between two messages, so a program that reads its input line by line
 * hands each line here.
 */
export async function localAnswer(sent: object, tools: LocalTool[], name: string): Promise<object | undefined> {
  const reply = (id: unknown, body: object): object => ({ jsonrpc: '2.0', id, ...body })
  let read: ReturnType<typeof readMessage>
  try {
    read = readMessage(JSON.stringify(sent), new Headers())
  } catch (error) {
    return reply(null, { error: { code: failures.request, message: failureShown(error).message } })
  }
  const { message: asked, version } = read
  if (asked.id === undefined || typeof asked.method !== 'string') return undefined
  const params = isStored(asked.params) ? asked.params : {}
  const serverInfo = { name, version: coreVersion }
  const capabilities = { tools: { listChanged: false } }
  if (asked.method === methods.discover)
    return reply(asked.id, { result: { supportedVersions: [newest, ...older], capabilities, serverInfo } })
  if (asked.method === methods.open)
    return reply(asked.id, { result: { protocolVersion: version, capabilities, serverInfo } })
  if (asked.method === methods.alive) return reply(asked.id, { result: {} })
  if (asked.method === methods.list) return reply(asked.id, { result: { tools: tools.map(listedOf) } })
  if (asked.method === methods.call) return reply(asked.id, { result: await called(tools, params) })
  return reply(asked.id, {
    error: { code: failures.method, message: `The method ${JSON.stringify(asked.method).slice(0, 80)} is not known.` },
  })
}
