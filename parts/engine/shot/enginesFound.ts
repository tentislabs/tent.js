import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { fetchPart } from '../fetchPart.ts'

/** The folder in which a tool of tests installs its browsers for this user. */
const testsFolder = (): string =>
  process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
      : join(homedir(), '.cache', 'ms-playwright')

/**
 * Takes the pattern of the names of a browser's folders that a tool of tests installed, and the places of its
 * program inside such a folder. Answers the program of the newest of them that is there, where there is one.
 */
function ofTests(named: RegExp, insides: string[][]): string | undefined {
  const folder = testsFolder()
  if (!existsSync(folder)) return undefined
  return readdirSync(folder)
    .filter((name) => named.test(name))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()))
    .flatMap((name) => insides.map((inside) => join(folder, name, ...inside)))
    .find(existsSync)
}

/** The version that the list of the fetched parts pins a part at: for a browser, the number of its build. */
function pinnedOf(part: string): string | undefined {
  const list: unknown = JSON.parse(readFileSync(new URL('../fetched.json', import.meta.url), 'utf8'))
  const line = (Array.isArray(list) ? list : []).find((one) => Reflect.get(Object(one), 'name') === part)
  return line === undefined ? undefined : String(Reflect.get(Object(line), 'version'))
}

/** The program of a fetched part: the first of the places inside its folder that is there. */
const inPart = (folder: string, insides: string[][]): string | undefined =>
  insides.map((inside) => join(folder, ...inside)).find(existsSync)

/**
 * Takes the name of a browser's part, the name of its folders that a tool of tests installs, the places of its
 * program inside, and the name a person knows it by. Answers the program of the build of the version that the list
 * pins: the one the tool of tests installed, else the part, fetched on first use. A browser installed on the
 * computer, or named by a variable, is never taken: what a test sees is the same on every computer. Throws T0016,
 * naming the part, where neither can be had.
 */
async function ofPinnedBuild(part: string, folder: string, insides: string[][], known: string): Promise<string> {
  const version = pinnedOf(part)
  const installed = version === undefined ? undefined : ofTests(new RegExp(`^${folder}-${version}$`), insides)
  if (installed) return installed
  let why: unknown
  const fetched = await fetchPart(part).then(
    (place) => inPart(place, insides),
    (error: unknown) => {
      why = error
      return undefined
    },
  )
  if (fetched) return fetched
  const error = new TentError(
    'T0016',
    `No ${known} of the build ${version ?? 'that is pinned'} is installed by the tool of tests, and the part ${part} could not be had.`,
    {
      fix: 'Install the browsers of the tool of tests at the version the project pins, or let the part be fetched once.',
    },
  )
  if (why !== undefined) error.cause = why
  throw error
}

/** What a browser is found by: its part with the places of its program there, how a tool of tests installs it, and how a person names it. */
export interface Wanted {
  part: string
  insides: string[][]
  // The name of its folders that a tool of tests installs, with the places of its program there.
  tests: { folder: string; named: RegExp; insides: string[][] }
  // The variable that names its program, the places it is installed on the computer, and the name a person knows it by.
  variable: string
  places: string[]
  known: string
  // What is said where none is found and none can be fetched.
  none: { message: string; fix: string }
}

/**
 * Takes whether the program is for a test, and what a browser is found by. Answers its program: for a test, the
 * build of the pinned version alone. Else the one that its variable names, else one that is installed on the
 * computer or by a tool of tests, else the one that is fetched on first use. Throws T0016, naming the part, where
 * none is found and none can be fetched.
 */
export async function browserProgram(o: { test?: boolean }, wanted: Wanted): Promise<string> {
  if (o.test) return ofPinnedBuild(wanted.part, wanted.tests.folder, wanted.insides, wanted.known)
  const named = process.env[wanted.variable]
  if (named && existsSync(named)) return named
  const found = wanted.places.find(existsSync) ?? ofTests(wanted.tests.named, wanted.tests.insides)
  if (found) return found
  try {
    const program = inPart(await fetchPart(wanted.part), wanted.insides)
    if (program) return program
  } catch (error) {
    if (error instanceof TentError) throw error
  }
  throw new TentError('T0016', wanted.none.message, { fix: wanted.none.fix })
}

/** Where the program of Firefox lies in a folder of its build, on each system. */
const firefoxInsides = [
  ['firefox', 'firefox.exe'],
  ['firefox', 'Nightly.app', 'Contents', 'MacOS', 'firefox'],
  ['firefox', 'firefox'],
]

/** The places where Firefox is installed on each system, the first found first. */
function firefoxPlaces(): string[] {
  const env = (name: string): string => process.env[name] ?? ''
  if (process.platform === 'win32')
    return [
      join(env('PROGRAMFILES'), 'Mozilla Firefox', 'firefox.exe'),
      join(env('PROGRAMFILES(X86)'), 'Mozilla Firefox', 'firefox.exe'),
    ]
  if (process.platform === 'darwin') return ['/Applications/Firefox.app/Contents/MacOS/firefox']
  return ['/usr/bin/firefox', '/usr/lib/firefox/firefox']
}

/**
 * Answers the program of a Firefox to drive over WebDriver BiDi. For a test, the build of the pinned version alone.
 * Else the one that `TENT_FIREFOX` names, else one that is installed on the computer or by a tool of tests, else the
 * one that is fetched on first use. Throws T0016, naming the part, where none is found and none can be fetched.
 */
export const firefoxFound = (o: { test?: boolean } = {}): Promise<string> =>
  browserProgram(o, {
    part: 'firefox',
    insides: firefoxInsides,
    tests: { folder: 'firefox', named: /^firefox-\d+$/, insides: firefoxInsides },
    variable: 'TENT_FIREFOX',
    places: firefoxPlaces(),
    known: 'Firefox',
    none: {
      message: 'No Firefox was found on the computer, and the one of the engine could not be fetched.',
      fix: 'Install Firefox, or name its program in TENT_FIREFOX.',
    },
  })

/** The WebDriver program of WebKit in the folder of its part, where the part holds one. */
const driverIn = async (): Promise<string | undefined> =>
  fetchPart('webkit').then(
    (folder) => inPart(folder, [['WebKitWebDriver'], ['WebKitWebDriver.exe']]),
    () => undefined,
  )

/**
 * Answers the WebDriver program of WebKit that speaks WebDriver BiDi, where one is. For a test, that of a pinned
 * WebKit alone, and never one of the computer. Else the one that `TENT_WEBKIT` names, else the one of WebKitGTK on
 * Linux or of Safari on macOS, else the one that is fetched on first use. Nothing where none is had: then a test in
 * WebKit is not run.
 */
export async function webkitFound(o: { test?: boolean } = {}): Promise<string | undefined> {
  if (o.test) return pinnedOf('webkit') === undefined ? undefined : driverIn()
  const named = process.env.TENT_WEBKIT
  if (named && existsSync(named)) return named
  const places =
    process.platform === 'darwin'
      ? ['/usr/bin/safaridriver']
      : process.platform === 'linux'
        ? ['/usr/bin/WebKitWebDriver', '/usr/libexec/webkit2gtk-4.1/WebKitWebDriver']
        : []
  return places.find(existsSync) ?? driverIn()
}
