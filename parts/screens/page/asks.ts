import { laterWrite } from './seen.ts'

/** What a page asks its engine through, with the write that it has seen. */
export interface Asks {
  // Sends a body as JSON to an address of the app, with the cookies of this site and the headers it is handed, and
  // reads what came back as JSON.
  post(address: string, body: unknown, headers?: Record<string, string>): Promise<unknown>
  // Asks an address of the app, with the cookies of this site, and reads what came back as JSON.
  get(address: string): Promise<unknown>
  // The latest write that the page has seen, in an answer or in a live message.
  seen(): string | undefined
  // Is told the write that a live message stands at.
  saw(at: string): void
}

/**
 * Takes what sends a request, as `fetch` of a browser does. Answers what a page asks its engine through. It keeps
 * the latest write that the page was answered at or sent, on an app of many machines, and each request names it
 * as `Tent-After`: so a machine which holds less waits for it, and the page never goes back in time.
 */
export function asksOf(send: (address: string, how: RequestInit) => Promise<Response>): Asks {
  let seen: string | undefined
  const after = (): Record<string, string> => (seen === undefined ? {} : { 'tent-after': seen })
  /** Reads what came back as JSON, and keeps the write that the answer stands at. */
  const taken = (answer: Response): Promise<unknown> => {
    seen = laterWrite(seen, answer.headers.get('tent-at'))
    return answer.json()
  }
  return {
    async post(address, body, headers = {}) {
      return taken(
        await send(address, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json', ...after() },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        }),
      )
    },
    async get(address) {
      return taken(await send(address, { credentials: 'same-origin', headers: after() }))
    },
    seen: () => seen,
    saw(at) {
      seen = laterWrite(seen, at)
    },
  }
}
