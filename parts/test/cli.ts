import { runCommandLine } from '../connect/index.ts'
import type { Terminal } from '../core/index.ts'
import type { App } from '../engine/index.ts'
import { adminTokenOf } from './adminToken.ts'

/** What `app.cli` is handed: the caller, what the input holds, whether a person sits at it, and what that person types. */
export interface CliAsked {
  as?: string
  input?: string
  person?: boolean
  answers?: string[]
}

/**
 * `app.cli(words, { as, input, person, answers })`: runs the app's own command line with those words, by the way
 * of this computer: the test app's own admin token and `Tent-Caller`, over `app.request` and `app.live`. Answers
 * what it printed and how it ended.
 */
export const cli =
  (app: () => App, dataFolder: () => string) =>
  async (words: string[], o: CliAsked = {}): Promise<{ code: number; out: string; err: string }> => {
    const token = adminTokenOf(dataFolder())
    const [out, err]: string[][] = [[], []]
    const typed = o.person
      ? [...(o.answers ?? [])]
      : (o.input ?? '').split(/\r?\n/).filter((one, k, all) => one !== '' || k < all.length - 1)
    const terminal: Terminal = {
      write: (text) => void out.push(text),
      error: (text) => void err.push(text),
      raw: (text) => void out.push(text),
      line: async () => typed.shift(),
      keys: async function* () {},
      size: () => ({ columns: 80, rows: 24 }),
      onResize: () => () => undefined,
      interactive: o.person === true,
      color: false,
    }
    const signed = (request: Request): Request => {
      const headers = new Headers(request.headers)
      headers.set('authorization', `Bearer ${token}`)
      headers.set('tent-caller', o.as ?? 'system')
      return new Request(request, { headers })
    }
    const code = await runCommandLine({
      words,
      terminal,
      reach: {
        request: (request) => app().request(signed(request), { from: '127.0.0.1' }),
        live: async (request) => app().live(signed(request)),
      },
      home: dataFolder(),
      target: { local: true, ...(o.as ? { as: o.as } : {}) },
      env: {},
    })
    return { code, out: out.join(''), err: err.join('') }
  }
