import type { McpEnv } from '../../connect/index.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import { called } from '../door/call.ts'
import { failureOf } from '../door/failure.ts'
import { answeredRun, runAskOf } from '../flows/askWaits.ts'
import { languageOf, grantWordOf } from '../grants/words.ts'
import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import type { About } from '../web/proxy.ts'
import { wireError } from '../wire.ts'
import { agreedOnPage, askedCallOf, keepWaiting, listedOf, onceFor } from './asked.ts'
import { engineAsks } from './asks.ts'
import { inlined } from './inline.ts'
import { chatFileOf, chatScreensOf, chatScreenShown } from './screens.ts'
import { callIdOf } from '../door/callIds.ts'
import { answeredBy, listened, requestDown, whoOf } from './streams.ts'

/** The refusal of a call that the person answered no. */
const saidNo = (): TentError =>
  new TentError('T7120', 'The person said no to this call, which asks a person before it runs.', {
    fix: 'Call it again, and ask the person again.',
  })

/**
 * The T7120 of a call that asks a person, for a caller that has a user: it carries the address of the app's page
 * where that person says yes or no, and the engine keeps the call there, for `askTime`: for the ask of a run, the
 * run and its step, which the page then answers, and for the ask of a sequence every call it lists.
 */
function paged(o: Opened, error: unknown, name: string, input: unknown, caller: Caller, origin: string): unknown {
  const text = error instanceof TentError && error.code === 'T7120' ? error.fields?.ask : undefined
  const user = caller.user?.id
  if (typeof text !== 'string' || user === undefined || !(error instanceof TentError)) return error
  const ask = runAskOf(o, text)
  const run = ask ? { run: { id: ask.run, step: ask.step, repeat: ask.repeat } } : {}
  if (!keepWaiting(o, text, { name, input, who: whoOf(caller), user, ...run, ...listedOf(error.fields) })) return error
  return new TentError('T7120', error.message, {
    ...(error.fix ? { fix: error.fix } : {}),
    fields: { ...error.fields, page: `${origin}/_t/ask?a=${encodeURIComponent(text)}` },
  })
}

/**
 * What the engine hands the MCP layer for one request of `/mcp`: the description of the running version; a call
 * through steps 5 to 10 of the door, as the caller, which asks a person first for a function that states
 * `danger: 'ask'` unless `mcp.asks` trusts the client's own asking, runs once for a yes that arrives twice, and
 * runs once with the yes a person gave on the page; a failure as this mode shows it; the limits and the words;
 * the kept stream of a caller; and the screens that are offered to MCP, their files and their tools' answers.
 */
export function mcpEnvOf(o: Opened, request: Request, about: About): McpEnv {
  const language = languageOf(o.description, request.headers.get('accept-language'))
  return {
    description: () => o.description,
    async call(name, input, caller, how = {}) {
      // A call sent again with the standard `Idempotency-Key` is answered as it was, and not run again.
      const callId = callIdOf(request.headers.get('idempotency-key'))
      const asked = async (given: unknown, agreed?: string): Promise<unknown> =>
        called(o, name, given, {
          caller,
          left: request.signal,
          about: { from: about.from, origin: about.origin },
          // A flow and an agent that are offered are tools like a function: the call waits for the run it starts.
          waits: true,
          runAsks: true,
          ...(engineAsks(o, caller) ? { asks: agreed === undefined ? {} : { agreed } } : {}),
          ...(callId ? { callId } : {}),
        })
      // The answer to the ask of a run that the call waited for: the run is told it, and the call waits again.
      const runAsk = how.agreed === undefined ? undefined : runAskOf(o, how.agreed)
      if (runAsk) {
        try {
          return await asked({ run: answeredRun(o, runAsk, caller, how.refused === true) })
        } catch (error) {
          throw paged(o, error, name, input, caller, about.origin)
        }
      }
      if (how.refused) throw saidNo()
      const call = askedCallOf(name, input, caller)
      const agreed = how.agreed ?? agreedOnPage(o, call)
      const run = (): Promise<unknown> => asked(input, agreed)
      try {
        return await (agreed === undefined ? run() : onceFor(o, agreed, call, run))
      } catch (error) {
        throw paged(o, error, name, input, caller, about.origin)
      }
    },
    wire(error) {
      const { ref } = failureOf(o, 'mcp', error)
      return wireError(error, o.mode !== 'live', ref ? { ref } : {})
    },
    limit: (name) => storedLimit(o.description, name),
    word: (key, filled) => grantWordOf(o.description, language, key, filled),
    askOver: (caller, method, params) => requestDown(o, whoOf(caller), method, params) ?? Promise.resolve(undefined),
    inline: (ids, caller) => inlined(o, ids, caller),
    listen: (caller) => listened(o, caller, about),
    answered: (caller, message) => answeredBy(o, caller, message),
    screens: () => chatScreensOf(o, language),
    screenFile: (uri) => chatFileOf(o, about.origin, uri),
    screen: (name, input, caller) => chatScreenShown(o, name, isStored(input) ? input : {}, caller, language, about),
  }
}
