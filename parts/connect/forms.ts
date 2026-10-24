import { isIPv4, isIPv6 } from 'node:net'

/**
 * An address in the one form that the ranges are checked in. `inside` is the IPv4 address that an IPv6 address
 * carries, where it is of a form that carries one and is still connected to as itself.
 */
export interface Read {
  address: string
  inside?: string
}

/** A host as it was written, read: a name in lowercase or an address in its one form, and the port where one was written. */
export interface Host {
  host: string
  port?: number
  // What the host is as an address, where it is one and no name.
  read?: Read
  // A name with an empty piece, as between two dots, which is the name of nothing.
  empty?: true
}

/** Answers what the standard reader of addresses makes of a host, or nothing where it reads none. */
function standard(host: string): string | undefined {
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return undefined
  }
}

/** Answers the eight numbers of an IPv6 address that is written in its shortest form. */
function groupsOf(shortest: string): number[] {
  const [head = '', tail] = shortest.split('::')
  const numbers = (text: string): number[] =>
    text === '' ? [] : text.split(':').map((one) => Number.parseInt(one, 16))
  const [first, last] = [numbers(head), numbers(tail ?? '')]
  return tail === undefined ? first : [...first, ...new Array<number>(8 - first.length - last.length).fill(0), ...last]
}

const dotted = (high: number, low: number): string => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`

/**
 * Takes an address as it was written, with or without the brackets of an IPv6 address: one number, numbers in
 * base eight or sixteen, fewer than four numbers, or an IPv6 address in any form. Answers the address it means,
 * or nothing for what is a name or no address. An IPv6 address that maps an IPv4 one is answered as that IPv4
 * address, and one of the four other forms that carry one is answered with it as `inside`.
 */
export function readAddress(written: string): Read | undefined {
  const bare = written.startsWith('[') && written.endsWith(']') ? written.slice(1, -1) : written
  if (!bare.includes(':')) {
    const host = standard(bare)
    return host !== undefined && isIPv4(host) ? { address: host } : undefined
  }
  if (!isIPv6(bare) || bare.includes('%')) return undefined
  const address = standard(`[${bare}]`)?.slice(1, -1)
  if (address === undefined) return undefined
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = groupsOf(address)
  const zeros = (...numbers: number[]): boolean => numbers.every((one) => one === 0)
  // ::ffff:0:0/96, which is the IPv4 address itself to every system.
  if (zeros(a, b, c, d, e) && f === 0xffff) return { address: dotted(g, h) }
  // ::ffff:0:0:0/96, ::/96 but for `::` and `::1`, 64:ff9b::/96 and 2002::/16.
  if (zeros(a, b, c, d, f) && e === 0xffff) return { address, inside: dotted(g, h) }
  if (zeros(a, b, c, d, e, f) && (g !== 0 || h > 1)) return { address, inside: dotted(g, h) }
  if (a === 0x64 && b === 0xff9b && zeros(c, d, e, f)) return { address, inside: dotted(g, h) }
  if (a === 0x2002) return { address, inside: dotted(b, c) }
  return { address }
}

/**
 * Takes a host as it was written, with a port after it or none: a name, an address in any form, or an IPv6 address
 * in brackets. Answers it read, or nothing for what is no host.
 */
export function hostOf(written: string): Host | undefined {
  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(written)
  const plain = isIPv6(written) ? [written, written, undefined] : /^([^:/?#@\\[\]\s]+)(?::(\d{1,5}))?$/.exec(written)
  const [, inner, port] = bracketed ?? plain ?? []
  if (inner === undefined || inner.includes('%')) return undefined
  const more = port === undefined ? {} : { port: Number(port) }
  const read = readAddress(inner)
  if (read) return { host: read.address, read, ...more }
  const name = bracketed ? undefined : standard(inner)
  if (name === undefined || name === '') return undefined
  // A name is the same name with every dot at its end taken off, however the dots were written.
  const held = name.replace(/\.+$/, '')
  if (held === '' || held.split('.').includes('')) return { host: name, empty: true, ...more }
  const under = readAddress(held)
  return under ? { host: under.address, read: under, ...more } : { host: held, ...more }
}
