import type { App, Engine } from '../engine/index.ts'
import type { History } from '../history/index.ts'
import { blobsType } from './blobsBody.ts'
import { syncLimit } from './limits.ts'
import { looseBlobs } from './serve/loose.ts'
import type { Previews } from './serve/previews.ts'
import { mergedPreviews, reopenPreviews, tidyPreviews } from './serve/previews.ts'
import { publishAnswer } from './serve/publishing.ts'
import { syncAnswer } from './serve/sync.ts'
import { valuesAnswer } from './serve/values.ts'

// The rights that each address of `/_t/sync` may be asked with: the handler holds a key to the one its part needs.
const anyRight = ['read', 'push', 'publish', 'bundle', 'copy', 'far']

/**
 * The pointers of a server's history that a caller is told: the branches and `live`, and none it keeps for
 * itself. A reader, whose key holds `copy` or `far`, is told the bundles of the versions too: it keeps the
 * history of its writer, to go on as the writer once it takes over.
 */
const shownPointers = (history: History, rights: string[]): Record<string, string> => {
  const reads = rights.includes('copy') || rights.includes('far')
  return Object.fromEntries(
    Object.entries(history.pointers()).filter(
      ([name]) =>
        name !== 'now' && name !== 'on' && !/^(at|seen|made):/.test(name) && (reads || !name.startsWith('bundle:')),
    ),
  )
}

/** The most bytes that a request to `/_t/sync` may hold: blobs one to a request as large as a file may be, JSON within `syncSize`. */
function sizeOf(app: App, request: Request): number {
  if (!(request.headers.get('content-type') ?? '').startsWith(blobsType)) return syncLimit(app.description, 'syncSize')
  const bundled = new URL(request.url).searchParams.get('for') === 'bundle'
  return syncLimit(app.description, bundled ? 'syncFileSize' : 'historyFileSize') + 4096
}

/**
 * Puts the work of the addresses of publishing behind `engine.serve` for one app, over the history of its server:
 * `/_t/sync/have`, `/_t/sync/blobs`, `/_t/sync/points`, `/_t/publish` and `/_t/publish/values`, each called with a
 * key that holds a right. Gives the history's share of the daily upkeep too, which drops what is kept no longer.
 * Where the data folder and the mode of the server are named, it keeps previews of branches beside its app: each
 * runs at a name of its own, is opened again with the server, and is taken away when its branch is merged into a
 * branch the server is pushed, or after `limits.previewKept`.
 */
export function serveSync(
  engine: Engine,
  app: App,
  history: History,
  o: { dataFolder?: string; mode?: string } = {},
): void {
  const loose = looseBlobs()
  const previews: Previews | undefined =
    o.dataFolder === undefined
      ? undefined
      : { engine, target: app, history, dataFolder: o.dataFolder, mode: o.mode ?? 'live', open: new Map() }
  const server = {
    app,
    history,
    loose,
    pointers: (rights: string[]) => shownPointers(history, rights),
    ...(previews ? { moved: (pointer: string, point: string) => mergedPreviews(previews, pointer, point) } : {}),
  }
  const publishing = {
    app,
    history,
    busy: false,
    kept: new Map<string, () => void>(),
    ...(previews ? { previews } : {}),
  }
  if (previews) void reopenPreviews(previews).catch(() => undefined)
  const limits = {
    perMinute: syncLimit(app.description, 'syncPerMinute'),
    time: syncLimit(app.description, 'publishTime'),
  }
  engine.serve(
    app,
    '/_t/sync',
    { right: () => anyRight, size: (request) => sizeOf(app, request), ...limits },
    (asked) => syncAnswer(server, asked),
  )
  engine.serve(
    app,
    '/_t/publish',
    { right: () => ['publish'], size: () => syncLimit(app.description, 'syncSize'), ...limits },
    (asked) =>
      new URL(asked.request.url).pathname === '/_t/publish/values'
        ? valuesAnswer(app, asked)
        : publishAnswer(publishing, asked),
  )
  engine.give(
    'upkeep',
    'history',
    {
      daily() {
        history.tidy(Date.now(), { kept: syncLimit(app.description, 'historyKept') })
        loose.tidied()
        if (previews) void tidyPreviews(previews, Date.now()).catch(() => undefined)
      },
    },
    app,
  )
}
