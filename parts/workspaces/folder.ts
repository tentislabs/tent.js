import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TentError } from '../core/index.ts'
import { isId } from '../engine/index.ts'
import type { Workspace } from './face.ts'

/** The record of a workspace as `workspace.json` holds it. */
interface Kept {
  format: 'tent.workspace/1'
  id: string
  owner: string
  name?: string
  createdAt: number
  live?: { version: string; address: string }
}

/** The folders of one workspace: its own, its project, its engine's folder, and those of its box and its live app. */
export interface Folders {
  root: string
  project: string
  data: string
  box: string
  live: string
}

/** The folders of the workspace of an id, under the folder that holds the workspaces. */
export const foldersOf = (folder: string, id: string): Folders => {
  const root = join(folder, id)
  return {
    root,
    project: join(root, 'project'),
    data: join(root, 'data'),
    box: join(root, 'box'),
    live: join(root, 'live'),
  }
}

/** The error of an id that names no workspace: any id that has not the form of the id of a row is one. */
export const noWorkspace = (id: unknown): TentError =>
  new TentError('T0001', `No workspace ${JSON.stringify(id).slice(0, 40)} is there.`, {
    fix: 'Name a workspace by the id that `create` answered.',
  })

/**
 * Reads the record of the workspace of an id from its folder, with the folder and the address it answers at.
 * Answers nothing for an id that is no id of a row, and for a folder that holds no record of that id: a folder is
 * a workspace by its record, and a link in its place is none.
 */
export function readWorkspace(folder: string, id: string, address: (id: string) => string): Workspace | undefined {
  if (!isId(id)) return undefined
  const { root } = foldersOf(folder, id)
  const file = join(root, 'workspace.json')
  if (!existsSync(file) || !lstatSync(root).isDirectory() || lstatSync(file).isSymbolicLink()) return undefined
  let read: unknown
  try {
    read = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
  const of = (name: string): unknown => Reflect.get(Object(read), name)
  if (of('format') !== 'tent.workspace/1' || of('id') !== id || typeof of('owner') !== 'string') return undefined
  const name = of('name')
  const live: unknown = of('live')
  const liveRecord = Object(live)
  return {
    id,
    owner: String(of('owner')),
    ...(typeof name === 'string' ? { name } : {}),
    createdAt: Number(of('createdAt') ?? 0),
    folder: root,
    address: address(id),
    ...(typeof liveRecord.version === 'string' && typeof liveRecord.address === 'string'
      ? { live: { version: liveRecord.version, address: liveRecord.address } }
      : {}),
  }
}

/** Writes the record of a workspace into its folder, whole, so that a stop in the middle leaves the older one. */
export function writeWorkspace(workspace: Workspace): void {
  mkdirSync(workspace.folder, { recursive: true })
  const record: Kept = {
    format: 'tent.workspace/1',
    id: workspace.id,
    owner: workspace.owner,
    ...(workspace.name === undefined ? {} : { name: workspace.name }),
    createdAt: workspace.createdAt,
    ...(workspace.live ? { live: workspace.live } : {}),
  }
  const file = join(workspace.folder, 'workspace.json')
  writeFileSync(`${file}.new`, `${JSON.stringify(record, null, 2)}\n`)
  renameSync(`${file}.new`, file)
}

/** The ids of the workspaces whose folders lie in the folder that holds them, in the order of their ids. */
export function workspaceIds(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isId(entry.name))
    .map((entry) => entry.name)
    .sort()
}
