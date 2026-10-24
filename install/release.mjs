// Makes a release of Tent.js into `install/out/<version>/`: the layers of each system, `release.json`,
// `systems.json` and `trust.json`, the installers with `install.sh`, the listings for winget and Homebrew, and the
// packages of the npm door. Each named step can be run alone over what an earlier run wrote, where its key lies.
// Run: node install/release.mjs --version <x.y.z> [--out <folder>] [--systems <list>] [--settings <file>]
//      [--from <address>] [--runtimes <folder>] [--natives <folder>] [--quality <0 to 11>] [--fix] [--releases <file>]
//      [--step <name>]
//      node install/release.mjs sign <file> [--settings <file>]      signs one list, as known.json, with the release keys
// The settings are the owner's file, never kept in the repository: { from, releaseKeys: [files], trust: [keys],
// windows: { pfx, password, timestamp, signtool }, apple: { installer, profile } }.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { layers } from './steps/layers.mjs'
import { linux } from './steps/linux.mjs'
import { listings } from './steps/listings.mjs'
import { lists, releaseKeys, sign, trust } from './steps/lists.mjs'
import { macos, signApple } from './steps/macos.mjs'
import { allSystems, npm } from './steps/npm.mjs'
import { buildParts } from './steps/parts.mjs'
import { signFile } from './steps/sign.mjs'
import { weigh } from './steps/weigh.mjs'
import { signWindows, windows } from './steps/windows.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const words = process.argv.slice(2)

/** The value of a flag, or nothing where it was not typed. */
const flag = (name) => {
  const at = words.indexOf(`--${name}`)
  return at < 0 ? undefined : words[at + 1]
}

const settingsFile = flag('settings') ?? join(root, 'install', 'settings.json')
const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {}
const say = (line) => console.log(line)

if (words[0] === 'sign') {
  const keys = releaseKeys({ settings })
  if (!words[1] || !keys.length) {
    console.error('node install/release.mjs sign <file> signs a list with the release keys that the settings name: none was named.')
    process.exit(2)
  }
  signFile(resolve(words[1]), keys)
  say(`sign: ${words[1]}.sig`)
  process.exit(0)
}

const version = flag('version')
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('A release names its version, three numbers with dots: --version 1.2.3.')
  process.exit(2)
}
const here = `${process.platform}-${process.arch}`
const systems = (flag('systems') ?? allSystems.join(',')).split(',').filter(Boolean)
for (const one of systems)
  if (!allSystems.includes(one)) {
    console.error(`${one} is no system of a release: ${allSystems.join(', ')}.`)
    process.exit(2)
  }
const top = resolve(flag('out') ?? join(root, 'install', 'out'))
const made = Date.now()
const c = {
  root,
  version,
  top,
  out: join(top, version),
  work: join(top, '.work', version),
  systems,
  here,
  settings,
  from: flag('from') ?? settings.from,
  runtimes: flag('runtimes') ? resolve(flag('runtimes')) : undefined,
  natives: flag('natives') ? resolve(flag('natives')) : undefined,
  releases: flag('releases') ? resolve(flag('releases')) : undefined,
  quality: Number(flag('quality') ?? 5),
  fix: words.includes('--fix'),
  made,
  day: new Date(made).toISOString().slice(0, 10),
  say,
}
mkdirSync(c.out, { recursive: true })

// The named steps, in the order of a whole release.
const steps = {
  parts: async () => say(`parts: ${await buildParts(root, join(c.work, 'tree'))} files`),
  trust: () => trust(c),
  layers: () => layers(c),
  linux: () => linux(c),
  windows: () => windows(c),
  macos: () => macos(c),
  lists: () => lists(c),
  sign: () => sign(c),
  'sign-windows': () => signWindows(c),
  'sign-apple': () => signApple(c),
  weigh: () => weigh(c),
  listings: () => listings(c),
  npm: () => npm(c),
}
const step = flag('step')
if (step !== undefined && !Object.hasOwn(steps, step)) {
  console.error(`--step names one of: ${Object.keys(steps).join(', ')}.`)
  process.exit(2)
}
try {
  for (const [name, run] of Object.entries(steps)) if (step === undefined || step === name) await run()
  if (step === undefined) rmSync(join(top, '.work'), { recursive: true, force: true })
  say(`Tent.js ${version} is in ${c.out}.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
