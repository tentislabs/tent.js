// A program that is killed during a save and started again: each start first holds the history against "it opens
// and its last point is whole", and then saves a number of times in a row.
// Run: node save.ts <the folder of a project>
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openHistory } from '../../index.ts'

const folder = process.argv[2]
const data = join(folder, '.tent')
mkdirSync(data, { recursive: true })
const print = (bytes) => createHash('sha256').update(bytes).digest('hex')
const broken = (words) => {
  console.log(`broken: ${words}`)
  process.exit(3)
}

// The file itself, as SQLite judges it, before the history opens it.
if (existsSync(join(data, 'history.db'))) {
  const file = new DatabaseSync(join(data, 'history.db'))
  const [row] = file.prepare('PRAGMA integrity_check').all()
  file.close()
  if (row.integrity_check !== 'ok') broken(`SQLite says ${row.integrity_check}`)
}

const history = openHistory(data)
const now = history.find('now')
let saved = 0
if (now) {
  if (!now.files) broken('the last point holds no files')
  for (const [path, fingerprint] of Object.entries(now.files)) {
    const bytes = history.blob(fingerprint)
    if (!bytes) broken(`the blob of ${path} is not there`)
    if (print(bytes) !== fingerprint) broken(`the blob of ${path} does not fit its fingerprint`)
  }
  // The files of the point are those of one save, and of no two: each file names the save that wrote it.
  const saves = new Set(Object.values(now.files).map((fingerprint) => new TextDecoder().decode(history.blob(fingerprint).subarray(0, 12))))
  if (saves.size !== 1) broken(`the last point holds files of ${saves.size} saves`)
  saved = Number(/^save (\d+)$/.exec(now.note ?? '')?.[1])
  if ([...saves][0] !== String(saved).padStart(12, '0')) broken(`the last point is save ${saved} and holds the files of ${[...saves][0]}`)
  for (const parent of now.parents) if (!history.read(parent)) broken(`the parent ${parent} is not there`)
}
// What the start before this one began, and whether its last save is there.
const begun = join(data, 'begun.txt')
const last = existsSync(begun) ? Number(readFileSync(begun, 'utf8').trim().split('\n').at(-1)) : 0
if (saved !== last && saved !== last - 1) broken(`save ${saved} is the last point, and save ${last} was begun`)
console.log(`whole at save ${saved} of ${last} begun: the last save was ${last > saved ? 'cut' : 'kept'}`)

// The points of the starts before are dropped, so that a thousand kills leave a small file: the upkeep is killed too.
history.tidy(Date.now() + 1, { kept: 0 })

// Bytes that do not pack, so that a save has work to do, each file with the number of its save in front.
const by = { kind: 'tool', id: 'killed' }
for (let n = last + 1; n <= last + 6; n++) {
  const head = new TextEncoder().encode(String(n).padStart(12, '0'))
  for (let k = 0; k < 8; k++) writeFileSync(join(folder, `file-${k}.bin`), Buffer.concat([head, randomBytes(65536)]))
  appendFileSync(begun, `${n}\n`)
  // Written at once, and not when the program next gives way: the kill is to arrive while this save is written.
  if (n === last + 2) writeSync(1, 'mid\n')
  history.record(folder, { by, kind: n % 4 ? 'save' : 'command', note: `save ${n}` })
}
history.close()
console.log('done')
