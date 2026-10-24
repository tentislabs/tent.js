import type { FileName, Files, Store } from '../data/index.ts'
import type { RunsAsked, RunView } from './face.ts'
import { holdsRuns, inEveryFile } from './everyFile.ts'
import { foundViews } from './views.ts'

/** Where runs are looked for: the shared file, and the files of the tenants where the app keeps any. */
export interface Places {
  store: Store
  files?: Files
}

/** The runs of one store that fit, each with the moment it was added. */
const inStore = (store: Store | undefined, o: RunsAsked): { at: number; view: RunView }[] =>
  store && holdsRuns(store) ? foundViews(store, o) : []

/** Visits every file of the app, the closed ones too, and answers the runs that fit, the newest first. */
async function inAll(places: Places, o: RunsAsked): Promise<RunView[]> {
  const found = (await inEveryFile(places.store, places.files, (store) => inStore(store, o))).flat()
  found.sort((a, b) => b.at - a.at)
  return (o.newest === undefined ? found : found.slice(0, o.newest)).map((one) => one.view)
}

/**
 * Answers the runs that fit what is asked, the newest first. Left out, `of` is the shared file; a `FileName` is
 * the file of that tenant; and `'all'` visits every file, the closed ones too, and so answers a promise.
 */
export function findIn(places: Places, o: RunsAsked & { of?: FileName | 'all' }): RunView[] | Promise<RunView[]> {
  const { of, ...asked } = o
  if (of === 'all') return inAll(places, asked)
  return inStore(of ? places.files?.of(of) : places.store, asked).map((one) => one.view)
}
