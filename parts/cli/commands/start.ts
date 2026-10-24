import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { boolean, choice, later, list, number, TentError, text } from '../../core/index.ts'
import { askAccount, finding, write } from '../../core/internal.ts'
import type { OpenOptions } from '../../engine/index.ts'
import { createEngine, keptAlone } from '../../engine/index.ts'
import type { History } from '../../history/index.ts'
import { openHistory } from '../../history/index.ts'
import type { Follower, HistoryFollower } from '../../publish/index.ts'
import { followHistory, followServer, serveSync } from '../../publish/index.ts'
import type { Command } from '../command.ts'
import { askedOfOwn, ownEngine } from '../reach.ts'
import { runsAsRoot } from '../serving/asRoot.ts'
import { keptUp } from '../serving/keptUp.ts'
import { secretKeyFrom } from '../serving/secretKey.ts'
import { secureFrom } from '../serving/secureFrom.ts'
import { serverFetch } from '../targets.ts'

/**
 * The reader of a sequence, where the build tools are installed, and none on a server without them. The build
 * tools are loaded at the first sequence it reads, so that a start loads none of them.
 */
function readerOfSource(): { readBody?: (text: string, o: { tools: string[]; fill: boolean }) => Promise<ReadBodyOf> } {
  try {
    import.meta.resolve('rolldown/parseAst')
  } catch {
    return {}
  }
  return { readBody: async (text, o) => (await import('../../build/index.ts')).readBody(text, o) }
}

type ReadBodyOf = ReturnType<typeof import('../../build/index.ts')['readBody']>

/** The newest bundle that `tent build` wrote into `.tent/build/` of a folder. Throws where there is none. */
function newestBundle(folder: string): string {
  const builds = join(folder, '.tent', 'build')
  const bundles = existsSync(builds)
    ? readdirSync(builds)
        .map((name) => join(builds, name))
        .filter((bundle) => existsSync(join(bundle, 'description.json')))
        .sort((a, b) => statSync(join(b, 'description.json')).mtimeMs - statSync(join(a, 'description.json')).mtimeMs)
    : []
  if (!bundles.length) throw new Error(`No bundle is in ${builds}: run \`tent build\` first, or name a bundle.`)
  return bundles[0]
}

// What each entry of `--proxy` takes, but `from`, which takes addresses.
const proxyTakes: Record<string, string[]> = {
  header: ['forwarded', 'x-forwarded'],
  scheme: ['https', 'http', 'header'],
  host: ['true', 'false'],
}

// The entries of `web` that are a count, and not a length of time or a size in words.
const counts = ['open', 'openPerAddress', 'atOnce']

/** Reads each `<name>=<value>` after `--proxy` or `--web` into the entry of the record of that name that it sets. */
function entriesOf(flag: string, written: unknown): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const one of Array.isArray(written) ? written : []) {
    const [name, value] = String(one).split(/=(.*)/s)
    if (!name || value === undefined) throw new Error(`--${flag} takes <name>=<value>, and was handed "${one}".`)
    entries[name] = value
  }
  return entries
}

/**
 * Reads the key of a reader from the file that `--key-from` names. A key is kept in a file that only the current
 * user can read: a file that another user may read, one that the current user does not own, and a link are
 * refused before a byte is read, with T0013, the name of the file and how it is closed. Throws where no file is
 * named, where it is not there, or where it holds no key.
 */
function keyFrom(folder: string, file: unknown): string {
  if (typeof file !== 'string')
    throw new Error('A reader is started with its key: name the file that holds it with --key-from.')
  const path = resolve(folder, file)
  const kept = keptAlone(path)
  if (kept.why !== undefined)
    throw new TentError('T0013', `The key of a reader is not taken from ${path}: ${kept.why}.`, {
      fix: `Keep the key in a file of your own that only you can read: ${kept.close}`,
    })
  const key = readFileSync(path, 'utf8').trim()
  if (key.length < 32) throw new Error(`The file ${file} holds no key of a reader: a key is 32 characters or more.`)
  return key
}

/** What the flags of the counts hand `engine.open`, each as it was typed. */
function countingFrom(
  args: Record<string, unknown>,
): Pick<OpenOptions, 'countBy' | 'countEvery' | 'levelEvery' | 'callerCountsKept' | 'countsKept'> {
  const by = args['count-by']
  const length = (flag: string, name: string): Record<string, string> =>
    typeof args[flag] === 'string' ? { [name]: String(args[flag]) } : {}
  return {
    ...(by === 'limits' || by === 'app' || by === 'caller' ? { countBy: by } : {}),
    ...length('count-every', 'countEvery'),
    ...length('level-every', 'levelEvery'),
    ...length('caller-counts-kept', 'callerCountsKept'),
    ...length('counts-kept', 'countsKept'),
  }
}

/**
 * Runs a bundle as a server, until the program is told to end. It never builds. The bundle is the newest in
 * `.tent/build/`, the data folder `.tent/`, the port 3000 and the mode `live`, where they are not named. `--seed`
 * applies the seed to data that is empty. With `--reads <address>` it runs a reader of the writer at that address,
 * with the key of the file that `--key-from` names: `--far` makes it a far one, `--own <address>` states where the
 * other machines reach it, and `--insecure` lets it reach its writer over a connection that is not secure. With
 * `--works <address>` it runs a worker of that writer, with the key of `--key-from`, the kinds of `--kinds` and the
 * folder of `--data`, and `--at-once`, `--load` and `--fetched` for its options. `--sleep-after <time>` lets the app
 * fall asleep when nothing used it for that long. `--domain <names>` serves those names securely, with certificates
 * that the engine gets, and `--secure <name>=<value>` sets each entry of `secure`. `--secret-key-from <file>` takes
 * the key of the secrets from a file that only the current user can read. It refuses to run as root or as an
 * administrator unless `--as-root` was typed. `--update fixes` takes a fix release of its line by itself, and
 * `--update all` every release of its major version, and ends with 75 to be started again on it. When it ends it
 * closes its engine, and answers what it ran.
 */
export const command: Command = {
  name: 'start',
  args: {
    bundle: text({ optional: true }),
    data: text({ optional: true }),
    port: number({ optional: true }),
    host: text({ optional: true }),
    mode: choice(['development', 'test', 'live'], { optional: true }),
    seed: boolean({ optional: true }),
    proxy: list(text(), { optional: true }),
    web: list(text(), { optional: true }),
    reads: text({ optional: true }),
    far: boolean({ optional: true }),
    own: text({ optional: true }),
    'key-from': text({ optional: true }),
    works: text({ optional: true }),
    kinds: text({ optional: true }),
    'at-once': number({ optional: true }),
    load: text({ optional: true }),
    fetched: text({ optional: true }),
    insecure: boolean({ optional: true }),
    parts: text({ optional: true }),
    'sleep-after': text({ optional: true }),
    'versions-from': text({ optional: true }),
    every: text({ optional: true }),
    'stop-runs': boolean({ optional: true }),
    move: boolean({ optional: true }),
    mail: boolean({ optional: true }),
    'count-by': choice(['limits', 'app', 'caller'], { optional: true }),
    'count-every': text({ optional: true }),
    'level-every': text({ optional: true }),
    'caller-counts-kept': text({ optional: true }),
    'counts-kept': text({ optional: true }),
    domain: text({ optional: true }),
    secure: list(text(), { optional: true }),
    'secret-key-from': text({ optional: true }),
    'as-root': boolean({ optional: true }),
    update: choice(['fixes', 'all', 'none'], { optional: true }),
  },
  needs: 'nothing',
  run: async ({ args, folder }) => {
    // On Windows the account is told by a program of the system, which was asked as the start began: its answer is
    // waited for here, before anything of the app is opened.
    if (process.platform === 'win32') await askAccount()
    // A server is never run with every right of the computer by mistake: the rights it needs are given another way.
    if (args['as-root'] !== true && runsAsRoot())
      return {
        findings: [
          finding('T0013', 'tent start does not run as root or as an administrator: an app needs no such rights.', {
            fix: 'Start it as a user of its own: tent service prints what does. Type --as-root where you mean it.',
          }),
        ],
      }
    const dataFolder = resolve(folder, typeof args.data === 'string' ? args.data : '.tent')
    // The key of the secrets is taken from a file of its own, and never from a definition of the system.
    if (typeof args['secret-key-from'] === 'string') {
      const key = secretKeyFrom(resolve(folder, args['secret-key-from']))
      if ('finding' in key) return { findings: [key.finding] }
      process.env.TENT_SECRET_KEY = key.key
    }
    const named = typeof args.bundle === 'string' ? resolve(folder, args.bundle) : undefined
    // A reader needs no bundle: it fetches the running version from its writer.
    const bundleOf = (): string => named ?? newestBundle(folder)
    const secured = secureFrom(args, folder)
    const many = {
      ...(typeof args.own === 'string' ? { own: args.own } : {}),
      ...(args.insecure === true ? { insecure: true } : {}),
    }
    const mode = args.mode === 'development' || args.mode === 'test' ? args.mode : 'live'
    const proxy = entriesOf('proxy', args.proxy)
    // Whom the engine believes is no setting to guess at: an entry that is none of its words ends the command.
    for (const [name, value] of Object.entries(proxy)) {
      const takes = Object.hasOwn(proxyTakes, name) ? proxyTakes[name] : undefined
      if (name !== 'from' && !takes) throw new Error(`--proxy takes from, header, scheme and host, and no "${name}".`)
      if (takes && !takes.includes(value))
        throw new Error(`--proxy ${name}=${value}: ${name} is one of ${takes.join(', ')}.`)
    }
    if (Object.keys(proxy).length && proxy.from === undefined)
      throw new Error('--proxy names the addresses of the proxy with from=<address>: no other entry holds without it.')
    const engine = createEngine({
      ...readerOfSource(),
      ...(typeof args.port === 'number' ? { port: args.port } : {}),
      ...(typeof args.host === 'string' ? { host: args.host } : {}),
      ...(secured ? { secure: secured.secure, host: secured.host } : {}),
      // An address of the builder's own that serves every part which is fetched at its first use.
      ...(typeof args.parts === 'string' ? { parts: { from: args.parts } } : {}),
      ...(proxy.from === undefined
        ? {}
        : {
            proxy: {
              from: proxy.from.split(','),
              ...(proxy.header === 'forwarded' || proxy.header === 'x-forwarded' ? { header: proxy.header } : {}),
              ...(proxy.scheme === 'https' || proxy.scheme === 'http' || proxy.scheme === 'header'
                ? { scheme: proxy.scheme }
                : {}),
              ...(proxy.host === 'true' ? { host: true } : {}),
            },
          }),
      web: Object.fromEntries(
        Object.entries(entriesOf('web', args.web)).map(([name, value]) => [
          name,
          counts.includes(name) ? Number(value) : value,
        ]),
      ),
    })
    // The program is ended by a signal: the engine is closed first, so that its calls end and its file is removed.
    const signals = ['SIGINT', 'SIGTERM'] as const
    let told = (): void => undefined
    const stopped = new Promise<void>((done) => {
      told = done
    })
    for (const signal of signals) process.once(signal, told)
    let history: History | undefined
    let unkept = (): void => undefined
    let took = false
    let follower: Follower | undefined
    let histories: HistoryFollower | undefined
    try {
      let key = ''
      try {
        if (typeof args.reads === 'string' || typeof args.works === 'string') key = keyFrom(folder, args['key-from'])
      } catch (error) {
        // A key file that is not kept as a key is a finding, with how the file is closed: no reader is started.
        if (!(error instanceof TentError)) throw error
        return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
      }
      if (typeof args.works === 'string') {
        // A worker holds no bundle and no data: it is handed the versions and the work by its writer.
        const commas = (value: unknown): string[] =>
          typeof value === 'string'
            ? value
                .split(',')
                .map((one) => one.trim())
                .filter(Boolean)
            : []
        const kinds = commas(args.kinds)
        if (!kinds.length) throw new Error('A worker states the kinds it is, with --kinds: --kinds gpu,any.')
        const worker = await engine.work({
          from: args.works,
          key,
          kinds,
          folder: dataFolder,
          ...(typeof args['at-once'] === 'number' ? { atOnce: args['at-once'] } : {}),
          ...(commas(args.load).length ? { load: commas(args.load) } : {}),
          ...(typeof args.fetched === 'string' ? { fetched: args.fetched } : {}),
          ...(args.insecure === true ? { insecure: true } : {}),
        })
        const { id } = worker.at()
        console.error(`A worker of ${kinds.join(', ')} works for ${args.works}. Press Ctrl+C to stop it.`)
        await stopped
        await worker.close()
        return { value: { worker: id, kinds, works: args.works } }
      }
      // A server that follows another takes what is live there, and each new version of it.
      if (typeof args['versions-from'] === 'string')
        follower = await followServer({
          engine,
          from: { address: args['versions-from'], key: process.env.TENT_KEY ?? keyFrom(folder, args['key-from']) },
          fetch: serverFetch(args.insecure === true ? new URL(args['versions-from']).host : undefined),
          dataFolder,
          ...(typeof args.every === 'string' ? { every: later(new Date(0), args.every).getTime() } : {}),
          ...(args['stop-runs'] === true ? { stopRuns: true } : {}),
          open: many,
          told: (line) => console.error(line),
        })
      const followed = follower?.app()
      const app = followed
        ? followed
        : typeof args.reads === 'string'
          ? await engine.read({
              from: args.reads,
              key,
              dataFolder,
              far: args.far === true,
              ...many,
            })
          : await engine.open(bundleOf(), {
              dataFolder,
              mode,
              ...many,
              ...(typeof args['sleep-after'] === 'string' ? { sleepAfter: args['sleep-after'] } : {}),
              ...(args.move === true ? { move: true } : {}),
              ...(secured ? { address: secured.address } : {}),
              ...(args.mail === true ? { sendMail: true } : {}),
              ...countingFrom(args),
            })
      // The server keeps the history it is pushed and published to beside its data, behind the addresses of publishing.
      history = openHistory(dataFolder)
      serveSync(engine, app, history, { dataFolder, mode })
      // A reader keeps the history of its writer too, with its own key: once it takes over, it serves it.
      if (typeof args.reads === 'string' && history)
        histories = followHistory({
          history,
          from: { address: args.reads, key },
          fetch: serverFetch(args.insecure === true ? new URL(args.reads).host : undefined),
          told: (line) => console.error(line),
        })
      if (args.seed === true) {
        // A seed is for data that holds no row: tables that an earlier command made, with nothing in them, are empty.
        const empty = await askedOfOwn(app, dataFolder, 'data', { what: 'empty' }, secured?.at)
        if (empty.findings) return { findings: empty.findings }
        if (empty.value === true) await app.seed()
        // Where it is not applied, the command says so, and never nothing.
        else console.error(`The data folder ${dataFolder} holds data already: the seed was not applied.`)
      }
      // The engine wrote down the port it listens on and the mode of the app: a reader runs in the mode of its writer.
      const runs = ownEngine(dataFolder)
      const { port } = runs
      // The app says its name and its running version as it says them to anyone who asks whether it is ready. A
      // reader answers nothing itself until it is current: its name and its version are those of what it runs.
      const health = await app.request(new Request(`http://localhost:${port}/_t/health`))
      const healthy: unknown = health.ok ? Reflect.get(Object(await health.json()), 'value') : undefined
      const said = health.ok
        ? { app: String(Reflect.get(Object(healthy), 'app')), version: String(Reflect.get(Object(healthy), 'version')) }
        : { app: app.description.app.name, version: write(app.description).versionId }
      const ran = { ...said, port, mode: typeof args.reads === 'string' ? String(runs.mode) : mode }
      // A server that mends itself takes a release of its line by itself, and is ended to be started again on it.
      if (args.update === 'fixes' || args.update === 'all')
        unkept = keptUp({
          update: args.update,
          say: (line) => console.error(line),
          took: () => {
            took = true
            told()
          },
        })
      // Said beside the answer, on the standard error: the answer of the command is what it prints when it ends.
      console.error(
        `${ran.app} runs at ${secured?.at ?? `http://localhost:${ran.port}`} (${ran.mode}). Press Ctrl+C to stop it.`,
      )
      await stopped
      return { value: ran }
    } finally {
      for (const signal of signals) process.removeListener(signal, told)
      unkept()
      follower?.close()
      histories?.close()
      await engine.close()
      history?.close()
      // The calls in flight have ended: the launcher starts the server again on the release it took.
      if (took) process.exit(75)
    }
  },
}
