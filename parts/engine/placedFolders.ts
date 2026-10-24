// The folders that a program of another language is handed a version by: each folder of a listed version laid out
// as links to its store, read by their places, and taken away once no version and no program needs it.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fingerprintOf } from '../core/internal.ts'
import type { Listed } from './files.ts'
import { fileAt, listAt, listedPath, pathsAt } from './files.ts'

/**
 * Takes the place of a version and one folder of it. Answers a folder that holds its files where they lie, for a
 * program of another language that reads files by their places: the folder itself, and for a list a folder of
 * links to the store, made once for each set of files and named by the fingerprint of that set.
 */
export function placedFolder(place: string, under: string): string {
  const list = listAt(place)
  if (!list) return join(place, under)
  const key = `${resolve(place)}
${under}`
  const held = placed.get(key)
  if (held !== undefined && existsSync(held)) return held
  const made = laidOut(place, list, under)
  placed.set(key, made)
  return made
}

// The folder of links that was laid out of each folder of a listed version, by the place and the folder.
const placed = new Map<string, string>()

// The folders of a version that a program of another language is handed by their places: the whole of it, to an
// outside program of MCP, and `python/`, to Python.
const handed = ['', 'python']

/** The folder of links of one folder of a listed version: beside its store, named by the fingerprint of its set. */
function placedAt(place: string, list: Listed, under: string): string {
  const paths = pathsAt(place, under)
  const set = fingerprintOf(new TextEncoder().encode(JSON.stringify(paths.map((path) => [path, list.files[path]]))))
  return join(dirname(list.store), 'placed', set)
}

// The folders of links that a program of this app runs from now, each with how many run from it.
const running = new Map<string, number>()
// The folders that a tidying left because a program ran from them: each goes once the last program left it.
const owed = new Set<string>()

/** Removes a folder of links with its mark of being whole: the mark first, so a folder that lost it is laid out again. */
function removedPlaced(made: string): void {
  // A folder that a program of another process still stands in cannot be removed on Windows: it is left.
  try {
    rmSync(`${made}.whole`, { force: true, maxRetries: 20, retryDelay: 50 })
    rmSync(made, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  } catch {}
}

/**
 * Takes a folder of links that `placedFolder` answered, which a program is started in. Marks that the program runs
 * from it, so that no tidying takes it away meanwhile. Answers what marks that the program left it: a folder that a
 * tidying left for it, and that no other program runs from, is then removed.
 */
export function runFrom(folder: string): () => void {
  running.set(folder, (running.get(folder) ?? 0) + 1)
  let left = false
  return () => {
    if (left) return
    left = true
    const now = (running.get(folder) ?? 1) - 1
    if (now > 0) {
      running.set(folder, now)
      return
    }
    running.delete(folder)
    if (owed.delete(folder)) removedPlaced(folder)
  }
}

/**
 * Takes the places of the versions that are loaded. Removes each folder of links beside the stores of their lists,
 * with its mark of being whole, that none of them is handed and no program runs from: a version that is left takes
 * its folders with it, and a folder that a program still runs from goes once the program has left it.
 */
export function placedTidied(places: string[]): void {
  const needed = new Set<string>()
  const beside = new Set<string>()
  for (const place of places) {
    const list = listAt(place)
    if (!list) continue
    beside.add(join(dirname(list.store), 'placed'))
    for (const under of handed) needed.add(placedAt(place, list, under))
  }
  for (const folder of beside) {
    let names: string[]
    try {
      names = readdirSync(folder)
    } catch {
      continue
    }
    for (const name of names) {
      const made = join(folder, name.replace(/\.whole$/, ''))
      if (needed.has(made)) owed.delete(made)
      else if (running.has(made)) owed.add(made)
      else removedPlaced(made)
    }
  }
}

/** Lays out the files of one folder of a listed version as a folder of links to its store, once for each set. */
function laidOut(place: string, list: Listed, under: string): string {
  const paths = pathsAt(place, under)
  const prefix = under === '' ? '' : `${listedPath(under).replace(/\/$/, '')}/`
  const folder = placedAt(place, list, under)
  if (existsSync(`${folder}.whole`)) return folder
  for (const path of paths) {
    const into = join(folder, path.slice(prefix.length))
    mkdirSync(dirname(into), { recursive: true })
    if (existsSync(into)) continue
    try {
      linkSync(fileAt(place, path), into)
    } catch {
      copyFileSync(fileAt(place, path), into)
    }
  }
  mkdirSync(folder, { recursive: true })
  writeFileSync(`${folder}.whole`, '')
  return folder
}
