import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { openHistory } from '../history/index.ts'
import type { History } from '../history/index.ts'
import type { App } from '../engine/index.ts'
import type { HeldBox } from './boxes.ts'
import type { Workspace, WorkspacesOptions } from './face.ts'
import type { Folders } from './folder.ts'
import type { Turning } from './turn.ts'
import { foldersOf, noWorkspace, readWorkspace } from './folder.ts'

/** What the workspaces hold of one workspace while the program runs. */
export interface One {
  workspace: Workspace
  folders: Folders
  // Its app on the test side, while it is open, and the print of the files it was built from.
  app?: App
  print?: string
  // The box it is built and run in, where its owner is not trusted.
  box?: HeldBox
  // Its live app in the product's own engine, once it was published there.
  live?: App
  history?: History
  // The opening or building that is under way: a second asker waits for it.
  opening?: Promise<App>
  // What the reader of its project last read of it, by the print of its files and the form it was read in.
  described?: { print: string; read: { description?: Description; findings: Finding[] } }
  // The turn that works on it in this program: one at a time.
  turning?: Turning
  // The newest tool that writes, carried out or waiting: a tool that writes waits for the one before it.
  writing?: Promise<unknown>
  // How many rows of its test data were changed while the program ran, as the engine tells each change.
  rowsChanged?: number
}

/** What the workspaces of a product hold: their options, and each workspace that was asked for. */
export interface Held {
  o: WorkspacesOptions
  ones: Map<string, One>
  closed: boolean
}

/** The name, with its port, at which an address is reached, in lowercase. */
export const hostOf = (address: string): string => new URL(address).host.toLowerCase()

/**
 * Takes what the workspaces hold and the id of a workspace. Answers what they hold of it, read from its folder the
 * first time, so that a folder that was put there while the program ran is found. Throws T0001 for an id that
 * names no workspace.
 */
export function oneOf(held: Held, id: string): One {
  const known = held.ones.get(id)
  if (known) return known
  const workspace = readWorkspace(held.o.folder, id, held.o.address)
  if (!workspace) throw noWorkspace(id)
  const one: One = { workspace, folders: foldersOf(held.o.folder, id) }
  held.ones.set(id, one)
  return one
}

/** The history of a workspace, in its engine's folder, opened at its first use and kept open. */
export function historyOf(one: One): History {
  one.history ??= openHistory(one.folders.data)
  return one.history
}
