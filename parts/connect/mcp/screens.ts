import type { Caller, Type } from '../../core/index.ts'
import { object } from '../../core/index.ts'
import { toJsonSchema } from '../../core/internal.ts'
import { isType } from '../callInput.ts'
import type { ToolAnswer } from './answer.ts'
import { failed } from './answer.ts'
import type { ChatScreen, McpEnv } from './env.ts'
import type { Marks } from './marks.ts'
import { titleOf } from './marks.ts'
import { app } from './standard.ts'

// A screen's tool only reads: it shows what the person may see, and changes nothing.
const marks: Marks = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }

/** The tool of a screen that is offered to MCP, with the address of its file, which a chat app shows in a frame. */
export function screenListed(screen: ChatScreen): object {
  const shape: Record<string, Type> = {}
  for (const [field, type] of Object.entries(screen.input)) if (isType(type)) shape[field] = type
  return {
    name: screen.name,
    title: titleOf(screen.name),
    description: screen.about,
    inputSchema: toJsonSchema(object(shape)),
    annotations: marks,
    _meta: { ui: { resourceUri: screen.uri } },
  }
}

/** The files that the layer offers to be read: the file of each screen that is offered to MCP. */
export const screenFiles = (screens: ChatScreen[]): object => ({
  resources: screens.map((one) => ({ uri: one.uri, name: one.name, title: titleOf(one.name), mimeType: app.kind })),
})

/**
 * The reading of the file of a screen: its text, with the app's address written into it, and the hosts that the
 * chat app lets the frame connect to and load from. Nothing for an address that names no file of a screen.
 */
export function screenFileRead(env: McpEnv, uri: string): object | undefined {
  const file = env.screenFile?.(uri)
  if (!file) return undefined
  const csp = { connectDomains: file.hosts, resourceDomains: file.hosts.slice(0, 1) }
  return { contents: [{ uri, mimeType: app.kind, text: file.text, _meta: { ui: { csp } } }] }
}

/**
 * The answer of a screen's tool: one line that names the screen, which the model is given, and in the part that
 * the frame alone is handed the record of the page, the pass of the frame and how often it asks again. Any
 * outcome that is not this screen is the tool's error.
 */
export async function screenAnswered(env: McpEnv, name: string, input: unknown, caller: Caller): Promise<ToolAnswer> {
  if (!env.screen) return failed(env.wire(new Error('No screen is shown here.')).error)
  try {
    const shown = await env.screen(name, input, caller)
    // A chat app may draw the screen or not, and gives its model the text alone: the text says the screen is
    // offered, and holds its data, by the name of what each answer read.
    const answers: unknown = Reflect.get(shown.page, 'answers')
    const data = Object.fromEntries(
      (Array.isArray(answers) ? answers : []).map((one) => [String(Object(one).what), Object(one).value ?? null]),
    )
    return {
      content: [
        {
          type: 'text',
          text: `The screen ${name} is offered to the person beside this answer. Its data: ${JSON.stringify(data)}`,
        },
      ],
      _meta: {
        'tent.page': shown.page,
        ...(shown.pass === undefined ? {} : { 'tent.pass': shown.pass }),
        'tent.frame': shown.frame,
      },
    }
  } catch (error) {
    return failed(env.wire(error).error)
  }
}
