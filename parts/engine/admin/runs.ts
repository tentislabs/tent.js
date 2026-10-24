import { TentError } from '../../core/index.ts'
import type { FileName } from '../../data/index.ts'
import type { RunView } from '../../flows/index.ts'
import type { Admin } from '../admin.ts'
import { badWord, wordOf } from '../admin.ts'
import type { Opened } from '../opened.ts'
import { bulkOf } from '../flows/bulkOf.ts'
import { traceOfRun } from '../trace/runs.ts'
import { asCall, callerNamed } from '../program.ts'

const system = callerNamed('system')

/** The error of a run that is named and is not there. */
const noRun = (id: string): TentError =>
  new TentError('T0001', `No run ${JSON.stringify(id).slice(0, 80)} is there.`, {
    fix: 'Name a run by its id, as `tent runs` lists it.',
  })

// How many runs a catch-up of a schedule starts with no `yes`.
const catchUpBound = 100

// How many runs the list answers at most: the newest ones.
const newest = 200

/** One run as the list tells it: what it is, where it stands, and the step it waits at. */
function line(run: RunView): object {
  const open = run.steps.find((step) => step.state !== 'done' && step.state !== 'failed')
  return {
    id: run.id,
    flow: run.flow,
    state: run.state,
    version: run.version,
    ...(open ? { step: open.name } : {}),
    ...(run.error ? { error: run.error.code } : {}),
  }
}

/**
 * Where the list looks: with `all` every file, with `of` the file of that tenant, by its id alone, and else the
 * shared file. A tenant with no file holds no run. T0002 for either word in an app that keeps no file for each tenant.
 */
async function placeOf(o: Opened, args: object): Promise<FileName | 'all' | undefined> {
  const of: unknown = Reflect.get(args, 'of')
  const all = Reflect.get(args, 'all') === true
  if (!all && of === undefined) return undefined
  if (!o.files)
    throw new TentError('T0002', 'The app keeps no data file for each tenant: its runs all stand in its one file.', {
      fields: { [all ? 'all' : 'of']: 'type' },
      fix: 'Leave out `--of` and `--all`.',
    })
  if (all) return 'all'
  if (typeof of !== 'string' || of === '') throw badWord('of', 'the id of a tenant: `--of <tenant id>`')
  const { rowsIn } = await import('../files/directory.ts')
  return rowsIn(o.store).find((row) => row.file.id === of)?.file ?? { table: '', id: of }
}

/**
 * Work on many runs at once, `stop` and `replay` with no `id`: the runs that the filter of its words fits, counted,
 * and acted on only where `yes` says so. Answers their count and ids, whether it acted, and the runs a replay started.
 */
async function many(o: Opened, what: 'stop' | 'replay', args: object): Promise<object> {
  const filter = bulkOf(args)
  const runner = o.flows?.runner
  const yes = Reflect.get(args, 'yes') === true
  if (!runner) return { count: 0, runs: [], done: yes }
  if (what === 'stop') return { ...(await runner.stopAll(filter, { dry: !yes })), done: yes }
  const from: unknown = Reflect.get(args, 'from')
  const replayed = await runner.replayAll({ ...filter, ...(typeof from === 'string' ? { from } : {}) }, { dry: !yes })
  return { count: replayed.count, runs: replayed.runs, done: yes, ...(yes ? { started: replayed.started } : {}) }
}

/**
 * `tent run <flow> --times <from> <to>`: one run for each time of the schedule of the flow between the two
 * moments, in their order, or with `dry` the times alone; more than 100 only with `yes`. T0002 for a moment that does
 * not read.
 */
function catchUp(o: Opened, args: object): object {
  const flow = wordOf(args, 'flow', 'the name of a flow: `tent run <flow> --times <from> <to>`')
  const { since: from, before: to } = bulkOf({
    flow,
    since: Reflect.get(args, 'times'),
    before: Reflect.get(args, 'to'),
  })
  if (from === undefined || to === undefined) throw badWord('times', 'two moments: `--times <from> <to>`')
  // On a reader the start is its writer's, as every write is.
  if (o.machine.reader) return o.machine.sent('runs', [args], system, false, () => undefined)
  const runner = o.flows?.runner
  if (!runner) throw new TentError('T0001', `The app holds no flow named ${JSON.stringify(flow).slice(0, 80)}.`)
  // More runs than a catch-up starts by itself are listed first, and started only with `yes`.
  const listed = runner.catchUp(flow, { from, to, dry: true }).times
  const dry = Reflect.get(args, 'dry') === true || (listed.length > catchUpBound && Reflect.get(args, 'yes') !== true)
  const { times, runs } = runner.catchUp(flow, { from, to, dry })
  return { flow, times: times.map((at) => new Date(at).toISOString()), runs, done: !dry }
}

/**
 * `tent runs`: the flows that are paused and the newest runs of the app, and with `what` one run in full, a new run
 * that reuses the saved steps of another before a step, a run moved to the version that runs now, a yes or a no for
 * a step that waits for one, a run stopped, what a run wrote taken back, work on many runs at once, and a flow paused
 * and resumed. Each that
 * names its run by `id` throws T0001 where no such run is there.
 */
export const admin: Admin = {
  name: 'runs',
  async run(o, args) {
    const what: unknown = Reflect.get(args, 'what') ?? 'list'
    const found = o.flows?.runner
    // A reader reads the runs in its own data: what writes is its writer's.
    const reads = found ?? o.runsRead
    if (what === 'list') {
      const of = await placeOf(o, args)
      const runs = of === 'all' ? await reads?.find({ newest, of }) : reads?.find({ newest, ...(of ? { of } : {}) })
      // A flow that is paused is told first, so that nobody wonders why its runs do not go on.
      const paused = reads?.paused() ?? []
      return { ...(paused.length ? { paused } : {}), runs: (runs ?? []).map(line) }
    }
    if (what === 'start') return catchUp(o, args)
    const bulk = (what === 'stop' || what === 'replay') && Reflect.get(args, 'id') === undefined
    const holding = what === 'pause' || what === 'resume'
    // On a reader the rest is the writer's: refused on live data, and sent to the writer on test data.
    if ((bulk || holding) && o.machine.reader) return o.machine.sent('runs', [args], system, false, () => undefined)
    if (bulk) return many(o, what, args)
    if (holding) {
      const flow = wordOf(args, 'flow', `the name of a flow: \`tent runs ${what} <flow>\``)
      if (!found) throw new TentError('T0001', `The app holds no flow named ${JSON.stringify(flow).slice(0, 80)}.`)
      await found[what](flow)
      return { flow, paused: what === 'pause' }
    }
    const id = wordOf(args, 'id', 'the id of a run')
    const shown = reads?.read(id)
    if (!shown) throw noRun(id)
    if (what === 'show') {
      // A run names the trace it stands in, which `tent logs --trace` reads.
      const trace = traceOfRun(o, id)
      return trace ? { ...shown, trace } : shown
    }
    // On a reader the rest is the writer's: refused on live data, and sent to the writer on test data.
    if (o.machine.reader) return o.machine.sent('runs', [args], system, false, () => undefined)
    if (!found) throw noRun(id)
    if (what === 'stop') {
      found.stop(id)
      return { run: id, state: found.read(id)?.state }
    }
    if (what === 'move') return { run: id, version: o.version, ...found.move(id, o.version) }
    if (what === 'undo') {
      // The admin of the machine undoes as the system: its own change names no one.
      const { undoneOfRun } = await import('../undo/ofRun.ts')
      const cx = {
        ...asCall(o, system, 'write', performance.now() + 60_000),
        work: { ...asCall(o, system, 'write', 0).work, kind: 'action' as const },
      }
      return {
        run: id,
        ...(await undoneOfRun(o, cx, id, {
          started: Reflect.get(args, 'started') === true,
          dry: Reflect.get(args, 'dry') === true,
        })),
      }
    }
    if (what === 'replay') {
      const from = wordOf(args, 'from', 'the name of the step to begin anew at: `--from <step>`')
      return { run: found.replay(id, { from, version: o.version }), from, of: id }
    }
    if (what === 'approve' || what === 'refuse') {
      const step = wordOf(args, 'step', 'the name of the step that waits')
      // A program that holds the app may hand the step data, and name the pass and the ask that it answers.
      const how: unknown = Reflect.get(args, 'how')
      found[what](id, step, Reflect.get(args, 'data'), typeof how === 'object' && how !== null ? how : undefined)
      return { run: id, step, approved: what === 'approve' }
    }
    throw badWord('what', 'one of show, replay, move, approve, refuse, stop, undo, pause and resume')
  },
}
