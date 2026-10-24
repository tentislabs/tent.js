import type { Caller } from '../../core/index.ts'
import { list } from '../callers/list.ts'
import type { Opened } from '../opened.ts'
import { visitorIn } from '../visitor.ts'
import type { About } from '../web/proxy.ts'

/** One way of telling who calls, as its file gives it. */
interface Way {
  order: number
  find(request: Request, app: Opened, about: About): Caller | undefined | Promise<Caller | undefined>
}

// The ways of telling who calls, in the order in which they are tried: loaded when the first request arrives.
let ways: Promise<{ name: string; way: Way }[]> | undefined

const inOrder = (): Promise<{ name: string; way: Way }[]> => {
  ways ??= Promise.all(list.map(async ({ name, load }) => ({ name, way: (await load()).caller }))).then((loaded) =>
    loaded.sort((a, b) => a.way.order - b.way.order),
  )
  return ways
}

/**
 * Step 3 of the door: takes an app, a request and what the engine knows of it. Works out the caller by the first
 * way that names one, each tried in its order, and answers it with the name of that way, the name of its file.
 * Where none names one the caller is nobody, and no way is named. Throws what a way throws: T0005 for one request
 * too many that would reach `identify`, and T0009 for an error in it.
 */
export async function namedCaller(o: Opened, request: Request, about: About): Promise<{ caller: Caller; by?: string }> {
  for (const { name, way } of await inOrder()) {
    const found = await way.find(request, o, about)
    if (found) return { caller: found, by: name }
  }
  // A caller who is nobody keeps the visitor of their cookie, where they have one.
  const visitor = visitorIn(o, request, about)
  return { caller: { kind: 'nobody', ...(visitor === undefined ? {} : { visitor }) } }
}
