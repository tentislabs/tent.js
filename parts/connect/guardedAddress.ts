import type { Mode } from '../data/index.ts'
import type { Host, Read } from './forms.ts'
import { hostOf, readAddress } from './forms.ts'
import { listedIn } from './hosts.ts'
import type { Lookup } from './lookup.ts'
import { systemLookup } from './lookup.ts'
import { rangeOf } from './ranges.ts'
import { refusedAddress } from './refused.ts'
import { shownHost } from './shown.ts'

/** What an address is held to: the hosts of a private network that the project lists, and the mode of the app. */
export interface Guard {
  privateHosts?: readonly string[]
  mode: Mode
}

/**
 * What is asked for: a host that was read, the address as an error shows it, and whether it is reached by a
 * secure connection, which is left out where the rule of the secure connection does not hold.
 */
export interface Asked extends Host {
  shown: string
  secure?: boolean
}

// The names that are refused before any look-up: the first two are this computer, the others a private network.
const ownNames = /(^|\.)localhost$/
const innerNames = /\.(local|internal)$/

/**
 * Takes what is asked for, what it is held to, and what looks a name up. Looks the name up once, and answers the
 * addresses that a connection may be made to, those of IPv4 first: each was read into the address it means and
 * held to the ranges, and a name that answers one refused address is refused whole. Throws T0022.
 */
export async function settled(asked: Asked, guard: Guard, lookup: Lookup): Promise<string[]> {
  const development = guard.mode === 'development'
  const refuse = (rule: 'secure' | 'private') => refusedAddress(asked.shown, rule)
  if (asked.empty) throw refuse('private')
  const byName = listedIn(guard.privateHosts, asked)
  const insecure = asked.secure === false
  // Nothing that a look-up answers could let it through: no name is looked up for it.
  if (insecure && !development && !(guard.privateHosts ?? []).some((one) => /^\s*http:\/\//i.test(one)))
    throw refuse('secure')
  if (!asked.read && !byName && (ownNames.test(asked.host) ? !development : innerNames.test(asked.host)))
    throw refuse('private')

  const answers = asked.read ? [asked.read] : (await lookup(asked.host)).map((one) => readAddress(one))
  const reads = answers.filter((one): one is Read => one !== undefined)
  if (reads.length === 0 || reads.length < answers.length) throw new Error(`The name ${asked.host} has no address.`)
  const withInside = (read: Read): string[] =>
    read.inside === undefined ? [read.address] : [read.address, read.inside]
  const ranges = reads.map(rangeOf)

  // A local address is one that is written as this computer: as an address of it, or as a name of it. Any other
  // name that answers this computer is held as on live data.
  const local = development && (asked.read ? ranges[0] === 'own' : ownNames.test(asked.host))
  // Each address that the name answers is held by itself: one that is refused refuses the name.
  const held = reads.map((read, at) => ({
    line: byName ?? listedIn(guard.privateHosts, asked, withInside(read)),
    own: local && ranges[at] === 'own',
    open: ranges[at] === 'open',
  }))
  if (insecure && held.some((one) => !one.line?.plain && !one.own)) throw refuse('secure')
  if (held.some((one) => !one.open && !one.own && !one.line)) throw refuse('private')
  const addresses = reads.map((read) => read.address)
  return [...addresses.filter((one) => !one.includes(':')), ...addresses.filter((one) => one.includes(':'))]
}

/**
 * Takes a host as it is written, with a port after it or none, what it is held to, and what looks a name up.
 * Answers the one address to connect to. Throws T0022 for a host that is refused, and a `TypeError` for what is
 * no host.
 */
export async function addressWith(host: string, guard: Guard, lookup: Lookup): Promise<string> {
  // What stands before an `@`, and from a slash or a question mark on, is no part of a host, and is told by no error.
  const shown = shownHost(host)
  // A host with a name or a password in front is refused, as an address with them is, and neither is told.
  if (/^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/?#]+@/i.test(host)) throw refusedAddress(shown, 'password')
  // An address with a zone names a network of this computer itself.
  if (shown.includes('%')) throw refusedAddress(shown, 'private')
  const read = hostOf(shown)
  if (!read) throw new TypeError('What was handed over is no host.')
  const [first = ''] = await settled({ ...read, shown }, guard, lookup)
  return first
}

/**
 * The address rule of the guarded fetch, for what opens a connection that is no fetch. Takes a host, a name or an
 * address in any form, with a port after it where one port of `privateHosts` is meant, and what it is held to.
 * Looks the name up once and answers the one address to connect to. Throws T0022 for a host that is private or
 * local and not listed.
 */
export const guardedAddress = (host: string, o: Guard): Promise<string> => addressWith(host, o, systemLookup)
