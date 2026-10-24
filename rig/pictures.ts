import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { differing as pixelsDiffering, readPng } from './png.ts'
import { system } from './system.ts'

type Engine = 'chromium' | 'firefox' | 'webkit'

const fingerprint = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Says why a stored picture is not approved, or nothing where the approval beside it holds its own fingerprint. */
function notApproved(stored: Uint8Array, approval: string): string | undefined {
  if (!existsSync(approval)) return 'it has no approval'
  const lines = /^sha256: ([0-9a-f]{64})\nby: \S.*\n?$/.exec(readFileSync(approval, 'utf8').replace(/\r\n/g, '\n'))
  if (!lines) return 'its approval is of another form than the two lines sha256 and by'
  return lines[1] === fingerprint(stored) ? undefined : 'its approval holds another fingerprint than its own'
}

/** Answers the share of the pixels of two pictures that differ, where a picture of another size differs wholly. */
function differing(stored: Uint8Array, png: Uint8Array): { share: number; words: string } {
  const [a, b] = [readPng(stored), readPng(png)]
  if (a.width !== b.width || a.height !== b.height)
    return { share: 1, words: `it is ${b.width} by ${b.height}, and the stored one ${a.width} by ${a.height}` }
  const { count, all, share } = pixelsDiffering(a, b)
  return { share, words: `${count} of its ${all} pixels differ from the stored one` }
}

/**
 * Holds a picture against the stored one. Takes the name of the picture, the bytes of a PNG file, the `engine` that
 * drew it, and in `within` the share of the pixels that may differ, from 0 to 1, which is 0.01 where it is not given.
 * The stored picture is `tests/pictures/<system>/<engine>/<name>.png` under the folder the program was started in.
 * A pixel differs when one of its four numbers differs by more than 8 of 255. Answers a promise, which is refused
 * where the picture does not hold, is not stored or is not approved. A picture that is not stored yet is written
 * beside its place as `<name>.new.png`. What it found is written to `results/parts/picture.<engine>.<name>.json`.
 */
export async function expectPicture(
  name: string,
  png: Uint8Array,
  options: { engine: Engine; within?: number },
): Promise<void> {
  const { engine, within = 0.01 } = options
  const folder = join('tests', 'pictures', system(), engine)
  const stored = join(folder, `${name}.png`)
  const state = (found: 'approved' | 'new') => {
    mkdirSync(join('results', 'parts'), { recursive: true })
    writeFileSync(join('results', 'parts', `picture.${engine}.${name}.json`), `${JSON.stringify(found)}\n`)
  }
  let why: string | undefined
  if (existsSync(stored)) why = notApproved(readFileSync(stored), join(folder, `${name}.approved`))
  else {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, `${name}.new.png`), png)
    why = `it is not stored yet, and was written as ${join(folder, `${name}.new.png`).replaceAll('\\', '/')}`
  }
  state(why ? 'new' : 'approved')
  if (why) throw new Error(`the picture ${engine}/${name} is not approved: ${why}`)
  const { share, words } = differing(readFileSync(stored), png)
  if (share > within)
    throw new Error(`the picture ${engine}/${name} does not hold: ${words}, and ${within} of them may`)
}

/** Answers every file under a folder whose name ends as given, each by its path from that folder. */
function filesOf(folder: string, ending: string, path = ''): string[] {
  return readdirSync(join(folder, path), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesOf(folder, ending, join(path, entry.name))
      : entry.name.endsWith(ending)
        ? [join(path, entry.name)]
        : [],
  )
}

/** Fetches what a run kept, and stores each new picture of it in its place, as the stored picture. */
function take(run: string): void {
  const fetched = mkdtempSync(join(tmpdir(), 'pictures-'))
  try {
    execFileSync('gh', ['run', 'download', run, '--dir', fetched], { stdio: 'inherit' })
    // What a run kept of one system lies in a folder of its own, under the paths the files had in the run.
    for (const kept of readdirSync(fetched))
      for (const file of filesOf(join(fetched, kept), '.new.png')) {
        const place = file.replace(/\.new\.png$/, '.png')
        mkdirSync(dirname(place), { recursive: true })
        cpSync(join(fetched, kept, file), place)
        console.log(`stored ${place.replaceAll('\\', '/')}`)
      }
  } finally {
    rmSync(fetched, { recursive: true, force: true })
  }
}

/** Writes the approval of a stored picture beside it: its fingerprint, and who approved it. */
function approve(picture: string, who: string): void {
  const approval = picture.replace(/\.png$/, '.approved')
  writeFileSync(approval, `sha256: ${fingerprint(readFileSync(picture))}\nby: ${who}\n`)
  console.log(`approved ${relative('.', approval).replaceAll('\\', '/')}`)
}

// This file is also a program: node rig/pictures.ts take <run>, and node rig/pictures.ts approve <picture> --by <who>.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [word, first, by, who] = process.argv.slice(2)
  if (word === 'take' && first) take(first)
  else if (word === 'approve' && first?.endsWith('.png') && !first.endsWith('.new.png') && by === '--by' && who)
    approve(first, who)
  else {
    console.log('node rig/pictures.ts take <run>\nnode rig/pictures.ts approve <picture>.png --by <who>')
    process.exitCode = 1
  }
}
