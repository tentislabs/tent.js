import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir, userInfo } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { Finding } from '../../core/index.ts'
import { boolean, text } from '../../core/index.ts'
import { finding, writeOwnerOnly } from '../../core/internal.ts'
import { keptAlone, runnerFolder } from '../../engine/index.ts'
import type { Command } from '../command.ts'
import type { Defined } from '../service/definitions.ts'
import { definitionName, definitionOf, lineOf } from '../service/definitions.ts'
import { openToOthers } from '../service/openToOthers.ts'
import { runsAsRoot } from '../serving/asRoot.ts'
import { command as start } from './start.ts'

type System = 'linux' | 'darwin' | 'win32'

// The words of `tent start` that name a file, which the definition holds by its whole path.
const files = ['secret-key-from', 'key-from']
// The entries of `--secure` that name a file.
const secureFiles = ['roots', 'cert', 'key']

/** The words of `tent start` as the definition holds them, from what was typed: `start`, the bundle and the data first. */
function wordsOf(args: Record<string, unknown>, folder: string, bundle: string, data: string): string[] {
  const words = ['start', bundle, '--data', data]
  for (const [name, type] of Object.entries(start.args)) {
    const value = args[name]
    if (name === 'bundle' || name === 'data' || value === undefined) continue
    if (type.kind === 'boolean') {
      if (value === true) words.push(`--${name}`)
    } else if (Array.isArray(value))
      for (const one of value) {
        const [entry = '', given] = String(one).split(/=(.*)/s)
        words.push(
          `--${name}`,
          name === 'secure' && secureFiles.includes(entry) && given !== undefined
            ? `${entry}=${resolve(folder, given)}`
            : String(one),
        )
      }
    else words.push(`--${name}`, files.includes(name) ? resolve(folder, String(value)) : String(value))
  }
  return words
}

/** The name of the app of a bundle. */
function appName(bundle: string): string {
  const read: unknown = JSON.parse(readFileSync(join(bundle, 'description.json'), 'utf8'))
  return String(Reflect.get(Object(Reflect.get(Object(read), 'app')), 'name'))
}

/** The user that a definition starts the app as, as the system names them. */
const userNow = (): string =>
  process.platform === 'win32' && process.env.USERDOMAIN
    ? `${process.env.USERDOMAIN}\\${userInfo().username}`
    : userInfo().username

/** Where the system reads a definition of that name, or nothing where it is handed to the system's own command. */
function placeOf(system: System, name: string, machine: boolean): string | undefined {
  if (system === 'linux') return `/etc/systemd/system/tent-${name}.service`
  if (system === 'darwin')
    return machine
      ? `/Library/LaunchDaemons/com.tentjs.${name}.plist`
      : join(homedir(), 'Library', 'LaunchAgents', `com.tentjs.${name}.plist`)
  return undefined
}

/** The definition of that name that the system holds already, or nothing. */
function heldNow(system: System, name: string, place: string | undefined): string | undefined {
  if (system !== 'win32') return place && existsSync(place) ? readFileSync(place, 'utf8') : undefined
  const done = spawnSync('schtasks', ['/query', '/tn', `Tent.js\\${name}`, '/xml', 'ONE'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  return done.status === 0 ? done.stdout : undefined
}

/**
 * Writes the definition where the system reads it: a file of the system, or on Windows a task handed to the task
 * scheduler. Makes the file of the key of the secrets with a new key, where neither it nor `secret.key` is there.
 * Answers what it wrote, or the finding that stops it.
 */
function writtenInto(
  system: System,
  o: Defined & { text: string; yes: boolean; keyFile?: string; data: string; user: string; typedUser: boolean },
): { value?: unknown; findings?: Finding[] } {
  const named = definitionName(o.name)
  const place = placeOf(system, named, o.machine)
  // A file of the system is written by root, and on Windows a task of the machine by an administrator.
  const needsRoot = system === 'linux' || o.machine
  const root = runsAsRoot()
  // The words as `tent service` takes them again: those of `tent start`, without `start` itself.
  const again = [
    'tent service --install',
    '--user',
    o.user,
    ...(o.machine ? ['--machine'] : []),
    ...o.words.slice(1),
  ].join(' ')
  if (needsRoot && !root && system === 'win32')
    return {
      findings: [
        finding('T0013', `The definition of ${named} is written where only an administrator may write.`, {
          fix: `In a terminal opened as an administrator, type: ${again}`,
        }),
      ],
    }
  // On macOS and Linux the definition is laid beside the data, and the administrator copies it into place: Tent.js
  // itself is never run as root, which runs nothing from a folder that another user owns.
  if (needsRoot && !root && place) {
    const laid = join(o.data, basename(place))
    mkdirSync(o.data, { recursive: true })
    writeFileSync(laid, o.text)
    const started =
      system === 'linux'
        ? `sudo systemctl daemon-reload && sudo systemctl enable --now tent-${named}`
        : `sudo launchctl bootstrap system ${place}`
    return {
      findings: [
        finding(
          'T0013',
          `The definition of ${named} is written where only an administrator may write: it lies in ${laid}.`,
          {
            fix: `Type: sudo install -m 644 ${laid} ${place} && ${started}`,
          },
        ),
      ],
    }
  }
  if (root && !o.typedUser)
    return {
      findings: [
        finding('T0013', 'tent service --install runs as root here, and the app is never started as root.', {
          fix: `Name the user it runs as: --user ${process.env.SUDO_USER ?? '<name>'}`,
        }),
      ],
    }
  const held = heldNow(system, named, place)
  if (held !== undefined && held.replace(/\r\n/g, '\n').trim() !== o.text.trim() && !o.yes)
    return {
      findings: [
        finding('T0013', `A definition of ${named} is there already, and stands as it is:\n${held}`, {
          fix: 'Type --yes to write over it.',
        }),
      ],
    }
  if (o.keyFile && !existsSync(o.keyFile) && !existsSync(join(o.data, 'secret.key'))) {
    mkdirSync(dirname(o.keyFile), { recursive: true })
    writeOwnerOnly(o.keyFile, `${randomBytes(32).toString('base64')}\n`)
  }
  if (place) {
    mkdirSync(dirname(place), { recursive: true })
    writeFileSync(place, o.text)
    return { value: { installed: place } }
  }
  // The task scheduler reads its definitions as text of two bytes a sign, which the mark at the start states.
  const file = join(tmpdir(), `tent-task-${process.pid}-${randomBytes(6).toString('hex')}.xml`)
  writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(o.text, 'utf16le')]))
  const done = spawnSync('schtasks', ['/create', '/tn', `Tent.js\\${named}`, '/xml', file, ...(o.yes ? ['/f'] : [])], {
    encoding: 'utf8',
    windowsHide: true,
  })
  rmSync(file, { force: true })
  if (done.status !== 0)
    return { findings: [finding('T0013', `The task scheduler did not take the task: ${done.stderr || done.stdout}`)] }
  return { value: { installed: `Tent.js\\${named}` } }
}

/**
 * Prints, for the system it runs on, what starts the app and starts it again when it ends: a systemd unit, a launchd
 * file, or a task of the task scheduler of Windows, with the words of `tent start` in it, which it takes without
 * `start` itself. Each file it names is held by its whole path. `--line` prints the one line alone, and `--machine`
 * starts it with the machine. A word with a line break is refused, and so are a launcher or a data folder that the
 * user does not own or that others can write, and a file of the key that others can read. `--install` writes it where
 * the system reads it, and a definition of the same name only with `--yes`.
 */
export const command: Command = {
  name: 'service',
  args: {
    ...start.args,
    line: boolean({ optional: true }),
    install: boolean({ optional: true }),
    machine: boolean({ optional: true }),
    user: text({ optional: true }),
    yes: boolean({ optional: true }),
  },
  needs: 'nothing',
  run: async ({ args, folder }) => {
    const system: System = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
    const home = runnerFolder()
    if (typeof args.bundle !== 'string')
      return { findings: [finding('T0013', 'tent service names the bundle it starts: tent service /srv/shop.')] }
    const bundle = resolve(folder, args.bundle)
    // What is no bundle is refused as `tent start` refuses it, before a word of a definition is made.
    if (!existsSync(join(bundle, 'description.json')))
      return {
        findings: [
          finding('T0011', `${bundle} holds no description.json, so it is no bundle.`, {
            fix: 'Name the folder that `tent build --out` wrote.',
          }),
        ],
      }
    const data = resolve(folder, typeof args.data === 'string' ? args.data : '.tent')
    const words = wordsOf(args, folder, bundle, data)
    const broken = words.find((one) => /[\r\n]/.test(one))
    if (broken !== undefined)
      return {
        findings: [
          finding('T0013', `A word with a line break is refused: ${JSON.stringify(broken).slice(0, 80)}.`, {
            fix: 'Type each word on one line.',
          }),
        ],
      }
    // The npm door names its own script, and the Node.js that runs it: the install's own folder holds no launcher then.
    const npmDoor =
      typeof process.env.TENT_LAUNCHER === 'string' && typeof process.env.TENT_NODE === 'string'
        ? [process.env.TENT_NODE, process.env.TENT_LAUNCHER]
        : undefined
    const launcher = npmDoor?.[1] ?? join(home, 'bin', system === 'win32' ? 'tentw.exe' : 'tent')
    for (const [what, path] of [
      ['The data folder', data],
      ['The launcher', launcher],
    ] as const) {
      const why = existsSync(path) ? openToOthers(path) : undefined
      if (why)
        return {
          findings: [
            finding('T0013', `${what} ${path} is refused: ${why}.`, {
              fix: 'Keep it in a folder of the user it runs as, which only that user can write.',
            }),
          ],
        }
    }
    const keyFile = typeof args['secret-key-from'] === 'string' ? resolve(folder, args['secret-key-from']) : undefined
    if (keyFile && existsSync(keyFile)) {
      const kept = keptAlone(keyFile)
      if (kept.why !== undefined)
        return {
          findings: [
            finding('T0013', `The file of the key ${keyFile} is refused: ${kept.why}.`, {
              fix: `Close it to every other user: ${kept.close}`,
            }),
          ],
        }
    }
    const user = typeof args.user === 'string' ? args.user : userNow()
    const defined: Defined = {
      name: appName(bundle),
      user,
      home,
      words,
      machine: args.machine === true,
      folder,
      ...(npmDoor ? { launcher: npmDoor } : {}),
    }
    if (args.line === true) return { value: lineOf(system, defined) }
    const shown = definitionOf(system, defined)
    if (args.install !== true) return { value: shown }
    return writtenInto(system, {
      ...defined,
      text: shown,
      yes: args.yes === true,
      data,
      user,
      typedUser: typeof args.user === 'string',
      ...(keyFile ? { keyFile } : {}),
    })
  },
}
