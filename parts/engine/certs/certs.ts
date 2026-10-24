// The certificates of one engine in their folder: gets a certificate for a name from an authority by one of the two
// proofs, keeps the account's key and the certificates there, readable only by the current user, and reads them back.
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import type { GuardedFetch } from '../../connect/index.ts'
import { proofCertificate } from './proofCertificate.ts'
import { asciiName, certificateRequest } from './request.ts'
import { certKeysOf, certKeyText, newCertKey } from './signed.ts'
import type { Speaker } from './speak.ts'
import { Refused, speak } from './speak.ts'
import { writeOwnerOnly } from '../../core/internal.ts'

/** The two proofs: on the plain port, and inside the secure connection. */
type Proof = 'plain' | 'inside'

// The two proofs by the names the standard gives them.
const proofNames: Record<Proof, string> = { plain: 'http-01', inside: 'tls-alpn-01' }

/** A certificate that a name is served with: its key and its chain as text, its life, and its fingerprint. */
export interface Held {
  key: string
  cert: string
  starts: number
  ends: number
  fingerprint: string
}

/** The certificates of one folder, and what gets more. */
export interface Certs {
  // The answer to the authority's question on the plain port, for a token it was given and for no other.
  answerFor(token: string): string | undefined
  // The certificate that proves a name inside the secure connection, while the authority asks for it.
  proofFor(name: string): { key: string; cert: string } | undefined
  // The certificate a name is served with, as the folder holds it.
  heldFor(name: string): Held | undefined
  // The names the folder holds a certificate for.
  heldNames(): string[]
  // Gets a certificate for a name, the first or a further one: the one before is served until the new one is kept.
  get(name: string, proof: Proof): Promise<Held>
}

/** Reads a kept certificate: its key, which stands first in the file, and the chain after it. */
function heldOf(text: string): Held {
  const at = text.indexOf('-----BEGIN CERTIFICATE-----')
  const cert = text.slice(at)
  const first = new X509Certificate(cert)
  return {
    key: text.slice(0, at),
    cert,
    starts: new Date(first.validFrom).getTime(),
    ends: new Date(first.validTo).getTime(),
    fingerprint: first.fingerprint256,
  }
}

/**
 * Takes the folder, `certs/` of the data folder, the guarded fetch, the authority's directory, and that its terms
 * were agreed to. `told` is handed the address of the terms when an account is made with them.
 */
export function openCerts(o: { folder: string; fetch: GuardedFetch; from: string; told(terms: string): void }): Certs {
  mkdirSync(o.folder, { recursive: true, mode: 0o700 })
  const answers = new Map<string, string>()
  const proofs = new Map<string, { key: string; cert: string }>()
  const held = new Map<string, Held>()
  let speaker: Promise<Speaker> | undefined

  // A file is written whole beside its place and then moved there, so that a reader sees the old or the new.
  const keep = (file: string, words: string): void => {
    writeOwnerOnly(join(o.folder, `${file}.new`), words)
    renameSync(join(o.folder, `${file}.new`), join(o.folder, file))
  }

  const spoken = async (): Promise<Speaker> => {
    const keyFile = join(o.folder, 'account.key')
    const held = existsSync(keyFile)
    const keys = held ? certKeysOf(readFileSync(keyFile, 'utf8')) : newCertKey()
    if (!held) keep('account.key', certKeyText(keys.privateKey))
    const made = await speak({ fetch: o.fetch, from: o.from, keys })
    // An account is kept with its key alone: a new key makes a new account, and a file that does not read is none.
    const accountFile = join(o.folder, 'account.json')
    let before: unknown
    try {
      before = held && existsSync(accountFile) ? JSON.parse(readFileSync(accountFile, 'utf8')) : undefined
    } catch {
      before = undefined
    }
    const known = Reflect.get(Object(before), 'from') === o.from ? Reflect.get(Object(before), 'account') : undefined
    const account = await made.account({ agreed: true, ...(typeof known === 'string' ? { known } : {}) })
    if (known === undefined) {
      keep('account.json', `${JSON.stringify({ from: o.from, account, terms: made.terms })}\n`)
      if (made.terms) o.told(made.terms)
    }
    return made
  }

  // Answers one question of the authority, and takes the answer away again whether it held or not.
  const prove = async (to: Speaker, name: string, address: string, proof: Proof): Promise<void> => {
    const question = await to.question(address)
    if (question.status === 'valid') return
    const asked = question.challenges.find((one) => one.type === proofNames[proof])
    if (!asked)
      throw new Refused(
        0,
        {
          detail: `the authority offers ${question.challenges.map((one) => one.type).join(', ')} for ${name}, and not ${proofNames[proof]}`,
        },
        address,
      )
    const answer = `${asked.token}.${to.fingerprint}`
    if (proof === 'plain') answers.set(asked.token, answer)
    else {
      const keys = newCertKey()
      proofs.set(name, {
        key: certKeyText(keys.privateKey),
        cert: proofCertificate(name, answer, keys.privateKey, keys.publicKey),
      })
    }
    try {
      await to.answered(asked.url)
      const end = await to.proven(address)
      if (end.status !== 'valid') {
        const failed = end.challenges.find((one) => one.error)?.error
        throw new Refused(
          Number(failed?.status ?? 0),
          failed ?? { detail: `the proof of ${name} ended ${end.status}` },
          address,
        )
      }
    } finally {
      answers.delete(asked.token)
      proofs.delete(name)
    }
  }

  return {
    answerFor: (token) => answers.get(token),
    proofFor: (name) => proofs.get(name),
    heldFor(name) {
      const kept = held.get(name)
      if (kept) return kept
      const file = join(o.folder, `${name}.pem`)
      if (!existsSync(file)) return undefined
      try {
        const read = heldOf(readFileSync(file, 'utf8'))
        held.set(name, read)
        return read
      } catch {
        // A file that does not read as a certificate is none: a new one is asked for.
        return undefined
      }
    },
    heldNames: () =>
      readdirSync(o.folder)
        .filter((file) => file.endsWith('.pem'))
        .map((file) => file.slice(0, -'.pem'.length)),
    async get(called, proof) {
      const name = asciiName(called)
      // A speaker whose start failed is made anew at the next try.
      speaker ??= spoken().catch((error: unknown) => {
        speaker = undefined
        throw error
      })
      const to = await speaker
      const order = await to.order([name])
      for (const address of order.authorizations) await prove(to, name, address, proof)
      const keys = newCertKey()
      const done = await to.finish(order, certificateRequest([name], keys.privateKey, keys.publicKey))
      if (done.status !== 'valid' || !done.certificate)
        throw new Refused(
          Number(done.error?.status ?? 0),
          done.error ?? { detail: `the order ended ${done.status}` },
          order.address,
        )
      const chain = await to.download(done.certificate)
      const text = certKeyText(keys.privateKey) + chain
      const read = heldOf(text)
      keep(`${name}.pem`, text)
      held.set(name, read)
      return read
    },
  }
}
