import { callerText } from '../../data/index.ts'
import type { AiEnv, Provider } from '../../ai/index.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { slot } from '../slot.ts'
import { servedFor } from '../flows/inside.ts'
import type { Opened } from '../opened.ts'
import { textOf } from '../readers/text.ts'
import { connectNow } from '../services/loaded.ts'
import { standInOf } from '../services/standIns.ts'
import { noteOutside, noteTouched } from '../touched.ts'
import { askedOf } from '../flows/leave.ts'
import { sourcesOf } from './sources.ts'
import { toldPart } from './told.ts'
import { mayDownload } from '../stored/access.ts'
import type { StoredFile } from '../stored/files.ts'
import { fileRow, putFile, streamOf, wholeBytes } from '../stored/files.ts'
import { valuesOf } from '../values/ofApp.ts'
import { visitorNow } from '../visitor.ts'
import { modelAllowed } from '../counts/limits.ts'
import { modelUsed } from '../counts/models.ts'
import { runAllowed } from '../counts/perRun.ts'
import { underWay } from '../context.ts'
import { keptNow, keepNow } from './kept.ts'
import { memoryAdd, memoryRead } from './memory.ts'
import { ownGuard } from './guards.ts'
import { factsRead } from './facts.ts'
import { recalled } from './recall.ts'
import { touch } from '../counts/cpu.ts'
import { didOnWorker, mayOnWorker } from './onWorker.ts'
import { sourceReaderOf } from './reader.ts'
import { ruled } from '../door/rule.ts'

/** The error of a file that is not there, or that is not this caller's to download: the two are told alike. */
const noFile = (id: string): TentError =>
  new TentError('T2104', `No file ${JSON.stringify(id).slice(0, 60)} can be read by the caller of this call.`, {
    fix: 'Hand the model a file that the caller may download.',
  })

/** The file of an id for a caller, by the rule of a download: the system reaches every file. */
function theirs(o: Opened, id: string, caller: Caller): StoredFile {
  const file = fileRow(o, id)
  if (!file || file.removedAt !== undefined) throw noFile(id)
  if (caller.kind !== 'system' && !mayDownload(o, caller, file, visitorNow())) throw noFile(id)
  return file
}

/** The hosts and addresses of `privateHosts` of a description, which the guarded fetch may reach. */
const privateOf = (description: Opened['description']): string[] => {
  const listed: unknown = Reflect.get(Object(description.project), 'privateHosts')
  return Array.isArray(listed) ? listed.map(String) : []
}

// The calls that the engine carries out itself for `ai`, in the call context of the step they are made in.
const engineOwn = ['_t_memoryRead', '_t_memoryAdd', '_t_agreed', '_t_guard', '_t_recall', '_t_facts']

// What the engine hands `ai` for each app, under its handles, which every version of it shares.
const envs = new WeakMap<object, AiEnv>()

/**
 * Takes an app and the providers that its makers and its program made. Answers what the engine hands `ai` for it,
 * made once: the descriptions of its versions, the guarded fetch, its secrets, the limits and the counting, its
 * calls, its files by the rule of a download, its providers and its stand-ins, its clock, and what a step keeps.
 */
export function aiEnvOf(o: Opened, providers: Record<string, Provider> = {}): AiEnv {
  const held = envs.get(o.handles)
  if (held) return held
  const env: AiEnv = {
    description: (version) => servedFor(o, version).description,
    fetch: (address, init) =>
      connectNow().guardedFetch({
        privateHosts: privateOf(o.description),
        mode: o.mode,
        bodyTravels: true,
      })(address, init),
    secret: (name) => valuesOf(o).secrets.value(name),
    // A model call is a call of the engine: a touch point where it begins and where it ends.
    allow(asked) {
      touch()
      // A call that the work on a worker makes is held to its limits by the writer, which counts them.
      const cx = underWay()
      if (cx?.remote) return mayOnWorker(cx, asked)
      modelAllowed(o, asked)
      if (asked.run) runAllowed(o, asked.run)
    },
    used(used) {
      touch()
      const remote = underWay()?.remote
      if (remote) return didOnWorker(remote, used)
      modelUsed(o, used)
      if (used.ok && used.answeredBy !== used.name)
        o.raise('model.fellBack', {
          app: o.app,
          name: used.name,
          answeredBy: used.answeredBy,
          reason: used.reason ?? '',
        })
    },
    call(name, args) {
      // The memory, the yes of a source and a guard of the engine's own are the engine's own, which no address reaches.
      if (!engineOwn.includes(name)) return slot.call(name, args)
      const cx = underWay()
      if (!cx) throw new TentError('T0013', `${name} was called with no call under way.`)
      if (name === '_t_agreed') return askedOf(cx, String(Reflect.get(Object(args[0]), 'name')))
      if (name === '_t_guard') return ownGuard(cx, args[0])
      if (name === '_t_recall') return recalled(cx, args[0])
      if (name === '_t_facts') return factsRead(cx, args[0])
      return name === '_t_memoryRead' ? memoryRead(cx, args[0]) : memoryAdd(cx, args[0])
    },
    tell: (run, part) => toldPart(o, run, Object(part)),
    files: {
      text: (id, caller) => textOf(o, theirs(o, id, caller)),
      bytes: (id, caller) => wholeBytes(o, theirs(o, id, caller)),
      async put(bytes, info, by) {
        const file = await putFile(o, streamOf(bytes), { name: info.name, kind: info.kind, by: callerText(by.caller) })
        return file.id
      },
      info(id, caller) {
        const file = theirs(o, id, caller)
        return { name: file.name, kind: file.kind, size: file.size }
      },
    },
    providers,
    standIn(model) {
      const stand = standInOf(o, model)
      const own = stand && Object.hasOwn(o.description.models, model) ? stand : undefined
      // Under `tent test`, each model a test called, and one that no test faked, whose answer is no test's own.
      noteTouched('models', model)
      if (!own) noteOutside(`model ${model}`)
      return own
    },
    get sources() {
      return sourcesOf(o.token)
    },
    now: () => o.clock.now(),
    sleep: (ms) => new Promise((done) => void o.clock.setTimer(o.clock.now() + ms, done)),
    kept: () => keptNow(o),
    keep: (value) => keepNow(o, value),
    // The rule of a tool for the caller of the call under way, where it reads neither the input nor a row.
    may(name) {
      const caller = underWay()?.caller
      const flows = o.description.flows
      const record = Object.hasOwn(o.description.functions, name)
        ? o.description.functions[name]
        : Object.hasOwn(flows, name)
          ? flows[name]
          : undefined
      if (!caller || !record) return undefined
      // The rule of an agent stands in its own record; one that states none has no rule to pass from code.
      const own: unknown = Reflect.get(Object(record.agent), 'access')
      if (record.agent !== undefined && own === undefined) return true
      const said = ruled(record.agent === undefined ? record.access : own, caller)
      return 'says' in said ? (said.says === 'in' ? true : undefined) : false
    },
    async outside(services, user) {
      const [{ lookedAt }, { heldTools }] = await Promise.all([
        import('../mcp/outside/look.ts'),
        import('../mcp/outside/found.ts'),
      ])
      await lookedAt(o, services, user)
      return heldTools(o)
    },
  }
  // A sequence is read by the reader of source alone, which the program hands over where the build tools are.
  const reader = sourceReaderOf(o.token)
  if (reader) env.read = reader
  envs.set(o.handles, env)
  return env
}
