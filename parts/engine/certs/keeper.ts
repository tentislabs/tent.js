// Keeps the certificates of the names an engine serves securely: asks for each that has none that is good, at the
// start and once an hour, renews one whose life runs out, holds the tries of each name to the rate, and answers the
// connection of each name with its certificate, or of the proof inside the secure connection with the proof's.

import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { SecureContext } from 'node:tls'
import { createSecureContext } from 'node:tls'
import { guardedFetch, typedHosts } from '../../connect/index.ts'
import { msOf } from '../words.ts'
import type { Certs, Held } from './certs.ts'
import { openCerts } from './certs.ts'
import { writeOwnerOnly } from '../../core/internal.ts'

/** What `secure` of `createEngine` takes: the names served with certificates, and how they are got and sent. */
export interface SecureOptions {
  names: string[] | ((name: string) => boolean | Promise<boolean>)
  from?: string
  roots?: string
  rate?: number
  renew?: number | string
  cert?: string
  key?: string
  hsts?: boolean | string
  port?: number
  plainPort?: number
}

/** What the secure side of the web asks of the certificates. */
export interface CertKeeper {
  // Whether a name is one that is served securely.
  listed(name: string): Promise<boolean>
  // The certificate a connection that names this name is served with, or nothing, and the connection is closed.
  contextFor(name: string): Promise<SecureContext | undefined>
  // The certificate of the proof of a name inside the secure connection, while the authority asks for it.
  proofFor(name: string): SecureContext | undefined
  // The answer to the authority's question on the plain port, for a token it was given and for no other.
  answerFor(token: string): string | undefined
  // The first look, once the plain port is listened on or could not be: which proof is made comes from that.
  started(plainListens: boolean): void
  close(): void
}

// The authority where `from` names none.
const letsEncrypt = 'https://acme-v02.api.letsencrypt.org/directory'

// How often the certificates are looked at, and the window that the rate counts tries in.
const lookEvery = 3_600_000
const hour = 3_600_000

/** The share of its life below which a certificate is renewed, or the time left below which it is. */
function renewOf(renew: number | string | undefined): { share: number } | { left: number } {
  if (renew === undefined) return { share: 1 / 3 }
  if (typeof renew === 'number') return { share: renew }
  const fraction = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(renew)
  if (fraction) return { share: Number(fraction[1]) / Number(fraction[2]) }
  const percent = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(renew)
  if (percent) return { share: Number(percent[1]) / 100 }
  if (/^\s*0?\.\d+\s*$/.test(renew)) return { share: Number(renew) }
  return { left: msOf('secure.renew', renew, 0) }
}

/** Whether a listed name holds a name: the same name, or one label in place of the star of `*.example.com`. */
function names(listed: string, name: string): boolean {
  const [one, two] = [listed.toLowerCase(), name.toLowerCase()]
  if (one === two) return true
  if (!one.startsWith('*.') || !two.endsWith(one.slice(1))) return false
  const label = two.slice(0, two.length - one.length + 1)
  return label !== '' && !label.includes('.')
}

/**
 * Takes `secure`, the folder of the certificates, `certs/` of the data folder of the first app, and what says a
 * line in the log. Answers the keeper, which asks for nothing until it is started.
 */
export function keepCertificates(o: {
  secure: SecureOptions
  folder: string
  say(level: 'info' | 'warning', message: string): void
}): CertKeeper {
  const { secure } = o
  const rate = secure.rate ?? 5
  const renew = renewOf(secure.renew)
  // A function of the builder may answer at once: then a name is held to the list with no wait.
  const listedNow = (name: string): boolean | Promise<boolean> =>
    typeof secure.names === 'function' ? secure.names(name.toLowerCase()) : secure.names.some((one) => names(one, name))
  const listed = async (name: string): Promise<boolean> => Boolean(await listedNow(name))
  // A certificate of the builder's own is served for every listed name, and nothing is asked of an authority.
  if (secure.cert !== undefined || secure.key !== undefined) {
    if (secure.cert === undefined || secure.key === undefined)
      throw new Error('secure.cert and secure.key are given together: a certificate is served with its key.')
    const own = createSecureContext({ cert: readFileSync(secure.cert), key: readFileSync(secure.key) })
    return {
      listed,
      contextFor: async (name) => ((await listed(name)) ? own : undefined),
      proofFor: () => undefined,
      answerFor: () => undefined,
      started: () => undefined,
      close: () => undefined,
    }
  }
  if (!existsSync(o.folder))
    o.say(
      'warning',
      `No certs/ was in the data folder: the certificates are asked for anew. Keep the data folder on a disk that is kept, since an authority gives the same names only a few times a week.`,
    )
  const from = secure.from ?? letsEncrypt
  // An authority over plain http could be answered by anyone on the way: nothing is asked of it, and no name served.
  if (URL.parse(from)?.protocol !== 'https:') {
    o.say(
      'warning',
      `T0013 secure.from is ${JSON.stringify(from.slice(0, 120))}, and an authority is named by an address over https: no certificate is asked for, and no secure connection is served.`,
    )
    return {
      listed,
      contextFor: async () => undefined,
      proofFor: () => undefined,
      answerFor: () => undefined,
      started: () => undefined,
      close: () => undefined,
    }
  }
  const roots = secure.roots === undefined ? undefined : readFileSync(secure.roots, 'utf8')
  const certs: Certs = openCerts({
    folder: o.folder,
    fetch: guardedFetch({ mode: 'live', privateHosts: typedHosts(from), ...(roots ? { roots } : {}) }),
    from,
    told: (terms) => o.say('info', `Typing --domain agreed to the terms of ${from}: ${terms}`),
  })
  const contexts = new Map<string, { fingerprint: string; context: SecureContext }>()
  const busy = new Set<string>()
  const waiting = new Map<string, NodeJS.Timeout>()
  let plain = true
  let closed = false
  let look: NodeJS.Timeout | undefined

  // The tries of each name in the last hour, kept in the folder: a program that starts again and again counts them.
  const triesFile = join(o.folder, 'tries.json')
  const triesOf = (): Record<string, number[]> => {
    try {
      const read: unknown = JSON.parse(readFileSync(triesFile, 'utf8'))
      return Object.fromEntries(
        Object.entries(Object(read)).map(([name, times]) => [name, Array.isArray(times) ? times.map(Number) : []]),
      )
    } catch {
      return {}
    }
  }

  const due = (held: Held | undefined, now: number): boolean => {
    if (!held) return true
    const left = held.ends - now
    return 'share' in renew ? left < renew.share * (held.ends - held.starts) : left < renew.left
  }

  const tryFor = (name: string): void => {
    if (closed || busy.has(name) || waiting.has(name)) return
    const now = Date.now()
    const all = triesOf()
    const lately = (all[name] ?? []).filter((at) => now - at < hour)
    if (lately.length >= rate) {
      const next = Math.min(...lately) + hour
      o.say(
        'warning',
        `The try for a certificate for ${name} waits until ${new Date(next).toISOString()}: ${lately.length} tries of the last hour were made, and secure.rate is ${rate}.`,
      )
      const timer = setTimeout(() => {
        waiting.delete(name)
        tryFor(name)
      }, next - now)
      timer.unref()
      waiting.set(name, timer)
      return
    }
    // For the current user alone, as every file of `certs/`, written beside its place and moved there.
    writeOwnerOnly(`${triesFile}.new`, `${JSON.stringify({ ...all, [name]: [...lately, now] })}\n`)
    renameSync(`${triesFile}.new`, triesFile)
    busy.add(name)
    certs
      .get(name, plain ? 'plain' : 'inside')
      .then(
        (held) => o.say('info', `A certificate for ${name} was got, good until ${new Date(held.ends).toISOString()}.`),
        (error: unknown) =>
          o.say(
            'warning',
            `A certificate for ${name} could not be got: ${error instanceof Error ? error.message : String(error)}. It is asked for again at the next look.`,
          ),
      )
      .finally(() => busy.delete(name))
  }

  // A name that a function serves is renewed while the function still serves it, as a listed name is.
  const looked = (): void => {
    const now = Date.now()
    if (typeof secure.names !== 'function') {
      for (const name of secure.names) if (!name.includes('*') && due(certs.heldFor(name), now)) tryFor(name)
      return
    }
    for (const name of certs.heldNames()) {
      if (!due(certs.heldFor(name), now)) continue
      const served = listedNow(name)
      if (served === true) tryFor(name)
      else if (served !== false)
        void served.then(
          (yes) => yes && tryFor(name),
          () => undefined,
        )
    }
  }

  return {
    listed,
    async contextFor(name) {
      // The name a connection sends is held to the list first, so no file is read for a name that is not served.
      if (!(await listed(name))) return undefined
      const held = certs.heldFor(name.toLowerCase())
      if (held) {
        const kept = contexts.get(name)
        if (kept?.fingerprint === held.fingerprint) return kept.context
        const context = createSecureContext({ key: held.key, cert: held.cert })
        contexts.set(name, { fingerprint: held.fingerprint, context })
        return context
      }
      // A name that a function serves is asked for at its first connection, which is closed meanwhile.
      if (typeof secure.names === 'function') tryFor(name.toLowerCase())
      return undefined
    },
    proofFor(name) {
      const proof = certs.proofFor(name.toLowerCase())
      return proof ? createSecureContext(proof) : undefined
    },
    answerFor: (token) => certs.answerFor(token),
    started(plainListens) {
      plain = plainListens
      looked()
      look = setInterval(looked, lookEvery)
      look.unref()
    },
    close() {
      closed = true
      clearInterval(look)
      for (const timer of waiting.values()) clearTimeout(timer)
      waiting.clear()
    },
  }
}
