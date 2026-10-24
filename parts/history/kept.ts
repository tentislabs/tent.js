import { join } from 'node:path'
import type { SqliteFile } from '../data/index.ts'
import { sqliteFile } from '../data/index.ts'

// The tables of the history, which are the history part's own: the bytes of the files, the points, the pointers,
// what each point changed, and the turns.
const tables = [
  'CREATE TABLE IF NOT EXISTS blobs (fingerprint TEXT PRIMARY KEY, size INTEGER NOT NULL, bytes BLOB NOT NULL) STRICT',
  `CREATE TABLE IF NOT EXISTS points (id TEXT PRIMARY KEY, parents TEXT NOT NULL, at INTEGER NOT NULL, by TEXT NOT NULL,
    kind TEXT NOT NULL, name TEXT, checked INTEGER, unsettled INTEGER, description TEXT, files TEXT, note TEXT,
    clashes TEXT) STRICT`,
  'CREATE INDEX IF NOT EXISTS points_named ON points (name, at) WHERE name IS NOT NULL',
  'CREATE INDEX IF NOT EXISTS points_built ON points (at) WHERE description IS NOT NULL',
  'CREATE TABLE IF NOT EXISTS pointers (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT',
  // What each point changed against its first parent, and the newest point that changed each thing.
  'CREATE TABLE IF NOT EXISTS changed (point TEXT PRIMARY KEY, parent TEXT NOT NULL, changes TEXT NOT NULL) STRICT',
  'CREATE TABLE IF NOT EXISTS newest (what TEXT NOT NULL, name TEXT NOT NULL, point TEXT NOT NULL, PRIMARY KEY (what, name)) STRICT',
  // The turns of an agent that builds, each with its two points and the snapshots of the data.
  `CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, state TEXT NOT NULL, stopped TEXT, before TEXT NOT NULL, after TEXT,
    dataBefore TEXT, dataAfter TEXT, dataCount INTEGER NOT NULL, dataEnd INTEGER, run TEXT, rounds INTEGER NOT NULL, findings TEXT NOT NULL,
    by TEXT NOT NULL, at INTEGER NOT NULL, used TEXT NOT NULL, asked TEXT) STRICT`,
]

/** Opens `history.db` in a folder, with its tables made where they are not there. */
export function openKept(folder: string): SqliteFile {
  const file = sqliteFile(join(folder, 'history.db'))
  file.write(() => {
    for (const table of tables) file.run(table, [])
  })
  return file
}
