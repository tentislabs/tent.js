import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { runnerFolder, sawList, shippedRelease, signedBy, trustedKeys } from '../engine/index.ts'

/** The `made` of a list of keys, or 0 where there is none that reads. */
function madeOf(file: string): number {
  try {
    const made = Number(Reflect.get(Object(JSON.parse(readFileSync(file, 'utf8'))), 'made'))
    return Number.isFinite(made) ? made : 0
  } catch {
    return 0
  }
}

/**
 * Takes the player of a release whose signed `release.json` a key of the install's list fitted. Takes the list of
 * keys it brings where its `made` is newer than the one the install holds, as `tent update` takes a newer list: an
 * older one brings no key back.
 */
function trustOfRelease(player: string): void {
  const home = runnerFolder()
  const file = join(home, 'trust.json')
  const brought = join(player, 'trust.json')
  const made = madeOf(brought)
  if (!existsSync(brought) || made <= madeOf(file)) return
  writeFileSync(`${file}.${process.pid}`, readFileSync(brought))
  renameSync(`${file}.${process.pid}`, file)
  sawList(home, 'trust', made)
}

/**
 * The first start of what the Linux installer unpacked: the signed `release.json` that it laid beside the version
 * is held to the keys of the player, and the archives it unpacked, by the fingerprints it kept, to that list. On a
 * miss what was unpacked is removed, and the sentence of T0026 is answered. Nothing to say after the first start,
 * and for an install that another door made.
 */
export function firstStart(): string | undefined {
  const shipped = shippedRelease()
  if (!shipped) return undefined
  const version = dirname(shipped.player)
  const kept = ['tent', 'tent-tools'].map((name) => join(version, `${name}.sha256`)).filter((one) => existsSync(one))
  if (!kept.length || existsSync(join(version, 'checked'))) return undefined
  const fits = (): boolean => {
    try {
      const bytes = readFileSync(join(version, 'release.json'))
      const signatures = readFileSync(join(version, 'release.json.sig'), 'utf8')
      if (!signedBy(bytes, signatures, trustedKeys(runnerFolder()))) return false
      const archives: unknown = Reflect.get(Object(JSON.parse(bytes.toString('utf8'))), 'archives')
      const prints = Object.values(Object(archives)).map((one) => Reflect.get(Object(one), 'fingerprint'))
      return kept.every((one) => prints.includes(readFileSync(one, 'utf8').trim()))
    } catch {
      return false
    }
  }
  if (fits()) {
    trustOfRelease(shipped.player)
    writeFileSync(join(version, 'checked'), `${new Date().toISOString()}\n`)
    return undefined
  }
  rmSync(version, { recursive: true, force: true })
  rmSync(join(runnerFolder(), 'current'), { force: true })
  return 'What was unpacked is not what Tent.js signed: it was removed. Install again from where Tent.js is served.'
}

// The commands that need the build tools, by the words they are typed with. Every other command is the player's.
const ofTheTools = [
  'new',
  'copy',
  'dev',
  'check',
  'test',
  'build',
  'add',
  'map',
  'docs',
  'export',
  'history',
  'publish',
]
const ofTheToolsToo = ['push', 'pull', 'login', 'mcp', 'python lock', 'api read', 'models', 'upgrade']

/** Whether a command, by the words it is typed with, is one of the build tools. */
const needsTools = (typed: string): boolean =>
  [...ofTheTools, ...ofTheToolsToo].some((one) => typed === one || typed.startsWith(`${one} `))

/**
 * Takes a command by the words it is typed with. Answers the one sentence that says the build tools bring it, where
 * it is one of theirs and this install holds the player alone; and nothing where it may run.
 */
export function lacksTools(typed: string): string | undefined {
  const shipped = shippedRelease()
  if (!shipped || shipped.tools !== undefined || !needsTools(typed)) return undefined
  return `tent ${typed} is one of the build tools, which this install does not hold: tent update --build-tools brings them.`
}

/**
 * Takes the folder of a project. Answers why no command works on it, where its own `.tent/` would be the folder
 * of the install, and nothing where it may be worked on.
 */
export function inTheInstall(project: string): string | undefined {
  if (resolve(project, '.tent') !== resolve(runnerFolder())) return undefined
  return `The project in ${project} would keep its data in the folder of the install, ${runnerFolder()}: make the project in a folder of its own.`
}

/** The version of `tentjs` that a folder or one above it names in its `package.json`, and the one it holds installed. */
function versionsAbove(folder: string): { named?: string; held?: string; at?: string } {
  let named: string | undefined
  for (let at = resolve(folder); ; at = dirname(at)) {
    const about = join(at, 'package.json')
    if (named === undefined && existsSync(about)) {
      const read: unknown = JSON.parse(readFileSync(about, 'utf8'))
      for (const group of ['dependencies', 'devDependencies']) {
        const one: unknown = Reflect.get(Object(Reflect.get(Object(read), group)), 'tentjs')
        if (typeof one === 'string') named = one
      }
    }
    const installed = join(at, 'node_modules', 'tentjs', 'package.json')
    if (existsSync(installed)) {
      const version: unknown = Reflect.get(Object(JSON.parse(readFileSync(installed, 'utf8'))), 'version')
      return {
        ...(named === undefined ? {} : { named }),
        ...(typeof version === 'string' ? { held: version } : {}),
        at,
      }
    }
    if (dirname(at) === at) return named === undefined ? {} : { named }
  }
}

/**
 * Takes a command. Answers whether it is handed over to the version of the framework that a project holds: a
 * command that works on a project is, but `tent upgrade`, which the newest installed version carries out, since only
 * the newer version holds the step to itself.
 */
export const handsOver = (command: { name: string; needs: string }): boolean =>
  command.needs === 'project' && command.name !== 'upgrade'

/**
 * Takes the folder a command that works on a project was typed in, and the words after `tent`. Where the project,
 * or a folder above it, holds a `tentjs` of another version than the one that runs, hands the command over to that
 * one, which starts the runtime it brought, and answers the number it ended with. Where the project names a
 * version that it does not hold, answers 2 after one sentence that says to run `npm install`. Answers nothing where
 * the version that runs carries the command out itself, as it does where the framework runs from its own sources.
 */
export function handedOver(here: string, words: string[], told: (line: string) => void): number | undefined {
  const shipped = shippedRelease()
  if (!shipped) return undefined
  const { named, held, at } = versionsAbove(here)
  if (held !== undefined && held !== shipped.version && at !== undefined) {
    const own = join(at, 'node_modules', 'tentjs', 'bin', 'tent.js')
    told(`This project holds tentjs ${held}: the command is carried out by that version.`)
    const done = spawnSync(process.execPath, [own, ...words], { cwd: here, stdio: 'inherit' })
    return done.status ?? 1
  }
  if (held === undefined && named !== undefined && named !== shipped.version) {
    told(
      `This project names tentjs ${named}, which it does not hold: run npm install in it, and type the command again.`,
    )
    return 2
  }
  return undefined
}
