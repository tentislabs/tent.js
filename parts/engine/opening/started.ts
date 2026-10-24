import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { copiedTo, listAt, listKept } from '../files.ts'
import { here } from '../../data/index.ts'
import { archiveOf } from '../archived/archive.ts'
import { keepFresh } from '../memoryRows.ts'
import type { App } from '../app.ts'
import { appOf } from '../app.ts'
import { loadCode } from '../code.ts'
import type { Machine } from '../copy/machine.ts'
import { keepCounting, stopCounting } from '../counts/gather.ts'
import { keepLevels } from '../counts/levels.ts'
import type { EngineFileBegun } from '../engineFile.ts'
import { removeEngineFile } from '../engineFile.ts'
import { flowsOf, needsFlows } from '../flows/needs.ts'
import { holdsReaderKeys, readerJoins } from '../keys/readerKeys.ts'
import { loneMachine } from '../lone.ts'
import { queryThreads } from '../threads/pool.ts'
import { keepUp } from '../upkeep.ts'
import { versionsOf } from '../versions.ts'
import { namesOf } from '../web/names.ts'
import type { Data } from './data.ts'
import type { UnderWay } from './frame.ts'

/**
 * Takes the frame of an opening, its data, which is brought to what the app is among its machines, and the
 * `engine.json` that the opening began. Loads the code of the app, and starts what works for it from here on: its
 * query threads, its machine among the machines of its data, the sweep of its rates, its upkeep and the keeper of
 * its lease. Writes `engine.json`, and tells the engine of the app. Answers the app. Each thing it starts is taken
 * back by the frame.
 */
export async function started(f: UnderWay, data: Data, engineFile: EngineFileBegun): Promise<App> {
  const { o, w, program, leased } = f
  const { dataFolder, version, mode } = w
  const { filing, tenantFiles } = data
  const reads = w.told.reads
  // The files that a stop left marked as open are read before the first request, and the upkeep is done.
  if (tenantFiles) await filing?.startTenantFiles(o, tenantFiles, reads !== undefined)
  // A version is run from a copy of its own in the folder of versions, so that its bundle may change or go: but
  // one that lies there already is run where it lies, and in development the list of its files, which lie once
  // each in a store by their fingerprints.
  if (mode !== 'development' && !reads) {
    o.bundle = join(versionsOf(o), version)
    if (!existsSync(o.bundle)) {
      if (listAt(w.bundleFolder)) copiedTo(w.bundleFolder, o.bundle)
      else cpSync(w.bundleFolder, o.bundle, { recursive: true })
    }
  } else if (mode === 'development' && !reads) o.bundle = listKept(dataFolder, version, w.bundleFolder)
  await loadCode(o)
  // A query thread makes a store and a room of its own, which a maker of the program cannot make there: with
  // either, a heavy query is carried out where every other query is.
  if (!program.makers.store && !program.makers.room) {
    o.threads = queryThreads(o)
    f.started.push(() => o.threads?.close())
  }
  // An app that was opened with no `own`, no `readers` and no `reads`, that has no lease, and whose data names
  // no other machine, runs on one machine: nothing of the link between machines is loaded for it.
  const said = here(o.store)
  const joins = reads !== undefined || w.told.keys.length > 0 || w.told.own !== undefined || leased !== undefined
  const joined =
    said.kept === true || (said.near?.length ?? 0) > 0 || said.took !== undefined || said.back !== undefined
  // An app that holds a key of a reader, of the right `copy` or `far`, is a writer that a reader may join.
  const keyed = !joins && !joined && holdsReaderKeys(o)
  // An app on one machine becomes the writer of a link at the first request with a key of a reader made since: the
  // link is loaded then, and the reader, which dials again, joins once it is.
  let became: Machine | undefined
  const joining = async (request: Request): Promise<void> => {
    if (became || !readerJoins(o, request)) return
    const { machineOf } = await import('../copy/machine.ts')
    if (became) return
    const made = machineOf(o, w.told)
    became = made
    f.setMachine(made)
    f.started.push(() => made.close())
  }
  const machine =
    joins || joined || keyed
      ? (await import('../copy/machine.ts')).machineOf(o, w.told)
      : loneMachine(o, w.told.insecure, joining)
  f.setMachine(machine)
  f.started.push(() => machine.close())
  // What the app counts is gathered from here on, and written when it closes; the writer measures its levels.
  keepCounting(o)
  if (!reads) keepLevels(o)
  f.started.push(() => stopCounting(o))
  const app = await appOf(o, w.app)
  f.setApp(app)
  const port = await program.listening({
    dataFolder: o.dataFolder,
    say: (level, message) => o.log.write('lines', { at: o.clock.now(), level, message, data: '{}', name: 'certs' }),
  })
  o.web.names = namesOf(w.address, port)
  if (w.address !== undefined && w.address !== '*') o.named = [w.address].flat()
  // The outside MCP servers of the app: the program of each that is one, and the look at their tools.
  if (!o.machine.reader && Object.values(o.description.services).some((one) => Boolean(one.mcp))) {
    const { originsOf, outsideStarted } = await import('../mcp/outside/started.ts')
    const outside = outsideStarted(o, originsOf(w.address, port))
    // They are ended before the data of the app is closed, and where the opening fails after this.
    o.before.push(outside)
    f.started.push(() => outside.close())
  }
  // The one upkeep of the app: a reader does a reader's share of it, and makes no backup.
  const upkeep = keepUp(o, reads !== undefined)
  o.upkeep = upkeep
  f.started.push(() => upkeep.close())
  // The archive is the writer's.
  if (!reads) {
    archiveOf(o)?.started()
    // The rows of a table kept in memory are taken away by the writer once they have lasted.
    const fresh = keepFresh(o)
    if (fresh) o.before.push(fresh)
    // The columns that work fills are made on the writer.
    const filling = (await import('../fill/pass.ts')).keepFilling(o)
    o.filling = filling
    f.started.push(() => filling.close())
  }
  if (leased) {
    const keeper = (await import('../copy/lease.ts')).keepLease(o, leased)
    o.before.push(keeper)
    f.started.push(() => keeper.close())
    // The writer of an app that has a lease writes with its first yes: the opening waits for that answer.
    await keeper.first
  }
  // An app that holds a flow has a runner, on the machine that writes: no other app loads anything of the flows.
  if (!reads && needsFlows(o.description)) {
    const { runner } = await (await import('../flows/starting.ts')).startRunner(o, { later: true })
    f.started.push(() => runner.close().then(() => undefined))
  } else if (reads) await flowsOf(o)
  // The kept columns that a switch made are filled on the writer before the app answers, by the one walk of a switch.
  if (!reads) await (await import('../keptWalk.ts')).walkKept(o)
  // The backfills of the version run once on the writer, before the app answers, and then the steps that wait for them.
  if (!reads && (Object.keys(o.description.backfills ?? {}).length || data.later?.length))
    await (await import('../backfilled.ts')).backfilled(o, data.later ?? [])
  // The file is taken away again where the writing of it fails half way, or anything after it.
  f.started.push(() => removeEngineFile(dataFolder))
  await engineFile.write({ port, token: program.token, mode })
  program.opened(o)
  f.started.push(() => program.left(o))
  machine.reader?.start()
  // The files that are behind the running layout are brought up beside the app, from here on.
  if (tenantFiles && !reads) filing?.startPass(o, tenantFiles)
  // The runs that were under way are taken up once the opening has answered: the program that opened the app has
  // given it first what it gives, as the sources of tools that a run names.
  const flows = o.flows
  if (flows)
    setImmediate(() => {
      if (!o.closed) flows.runner.takeUp()
    })
  return app
}
