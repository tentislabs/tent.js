import { callerText } from '../../data/index.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { AppServices, ConnectEnv } from '../../connect/index.ts'
import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import { underWay } from '../context.ts'
import type { Opened } from '../opened.ts'
import { mayDownload } from '../stored/access.ts'
import type { StoredFile } from '../stored/files.ts'
import { bytesFor, fileRow, fileStore, putFile, streamOf } from '../stored/files.ts'
import { kindOf } from '../stored/kind.ts'
import { storedLimit } from '../limits.ts'
import { valuesOf } from '../values/ofApp.ts'
import { privateHostsOf } from '../fetch/address.ts'
import { versionGone } from '../versions.ts'
import { visitorNow } from '../visitor.ts'
import { tokensOf, writeTokens } from '../connections/kept.ts'
import { connectNow, loadConnect } from './loaded.ts'
import { signingOf } from './signing.ts'
import { isHeld } from '../mcp/outside/found.ts'
import { programChannel } from '../mcp/outside/programs.ts'
import { foundFor } from '../mcp/outside/discover.ts'
import { visit } from '../visit.ts'
import { standInOf } from './standIns.ts'
import { countedServiceFetch } from '../counts/services.ts'
import { headed } from '../web/headed.ts'

// The once-only key of the service call that is being made, which `connect` asks for while it builds the request.
const onceKeys = new AsyncLocalStorage<string | undefined>()

/** Carries a service call out with the once-only key that its step gives it. */
export const withOnce = <T>(key: string | undefined, work: () => T): T => onceKeys.run(key, work)

// The services of each app, made at its first service call, and what `connect` is handed for it: under its handles,
// which every version of it shares.
const made = new WeakMap<object, AppServices>()
const envs = new WeakMap<object, ConnectEnv>()

/** The error of a file of an input that the caller may not download: told as one that is not there. */
const noFile = (id: string): TentError =>
  new TentError('T2104', `No file ${JSON.stringify(id).slice(0, 60)} can be read by the caller of this call.`, {
    fix: 'Hand the service a file that the caller may download.',
  })

/** The file of an id for a caller, by the rule of a download: the system reaches every file. */
function theirs(o: Opened, id: string, caller: Caller): StoredFile {
  const file = fileRow(o, id)
  if (!file || file.removedAt !== undefined) throw noFile(id)
  if (caller.kind !== 'system' && !mayDownload(o, caller, file, visitorNow())) throw noFile(id)
  return file
}

// How many first bytes of a file that a service hands are read to tell its kind.
const headSize = 65_536

/**
 * Takes an app. Answers what the engine hands `connect` for it: the description of each version it can load, the
 * guarded fetch held to its `privateHosts` and its mode, its secrets, what its makers made, the stand-ins of a
 * test, the once-only key of the call, its files by the rule of a download, its log, and its clock.
 */
export function connectEnvOf(o: Opened): ConnectEnv {
  const held = envs.get(o.handles)
  if (held) return held
  const { signers, verifiers } = signingOf(o)
  const { guardedFetch: guarded, endingOf } = connectNow()
  const env: ConnectEnv = {
    description(version) {
      const served = version === o.version ? o : o.versions?.get(version)?.served
      if (!served) throw versionGone(version)
      return served.description
    },
    // The hosts that the app may reach are those of the version that runs at the moment of the call.
    // A request of a service call is counted under that call, with its bytes.
    fetch: (address, init) =>
      countedServiceFetch(o, init, address, () =>
        guarded({ privateHosts: privateHostsOf(o.description), mode: o.mode, bodyTravels: true })(address, init),
      ),
    secret: (name) => valuesOf(o).secrets.value(name),
    tokens: {
      read: (service, user, account) => tokensOf(o, service, user, account),
      write: (service, user, account, tokens) => writeTokens(o, { service, user, account }, tokens),
    },
    signers,
    verifiers,
    standIn: (service) => standInOf(o, service),
    once: () => onceKeys.getStore(),
    setting: (name) => Reflect.get(valuesOf(o).settings.values, name),
    files: {
      async stream(id, caller) {
        const file = theirs(o, id, caller)
        await bytesFor(o, file)
        return fileStore(o).get(file.fingerprint)
      },
      info(id, caller) {
        const file = theirs(o, id, caller)
        return { name: file.name, kind: file.kind, size: file.size }
      },
      async put(bytes, info, by) {
        // The kind is the one the first bytes say: a name that a service gave no ending gets the ending of that kind.
        const { head, all } = await headed(new Response(bytes).body ?? streamOf(new Uint8Array()), headSize)
        const kind = kindOf(head.subarray(0, headSize), info.kind)
        const name = /\.[^.]+$/.test(info.name) ? info.name : `${info.name}${endingOf(kind)}`
        // A file that a service hands is held to `uploadSize` as it arrives, as one that a person sends is.
        const most = storedLimit(o.description, 'uploadSize')
        const file = await putFile(o, all, { name, kind, by: callerText(by.caller), most })
        return file.id
      },
    },
    logged(row) {
      const run = underWay()?.run?.id
      o.log.write('outgoing', { at: o.clock.now(), ...row, ...(run ? { run } : {}) })
    },
    now: () => o.clock.now(),
    sleep: (ms) => new Promise((done) => void o.clock.setTimer(o.clock.now() + ms, done)),
    found: (service) => foundFor(o, service, visit()?.about.origin ?? ''),
    channel: (service, user) => programChannel(o, service, user),
    held: (service, tool) => isHeld(o, service, tool),
  }
  envs.set(o.handles, env)
  return env
}

/** Answers the services of an app, which `connect` makes at the first service call: the part is loaded then. */
export async function servicesOf(o: Opened): Promise<AppServices> {
  const held = made.get(o.handles)
  if (held) return held
  const { createServices } = await loadConnect()
  const services = made.get(o.handles) ?? createServices(connectEnvOf(o))
  made.set(o.handles, services)
  return services
}
