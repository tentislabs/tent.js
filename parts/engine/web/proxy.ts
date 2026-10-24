import { BlockList, isIP, isIPv4 } from 'node:net'

/** The proxies that stand in front of an engine, and what of their word about a request is believed. */
export interface ProxyOptions {
  from: string[]
  header?: 'x-forwarded' | 'forwarded'
  host?: boolean
  scheme?: 'https' | 'http' | 'header'
}

/** How a request reached the engine: the address of the connection, and the scheme and the name it was sent to. */
export interface Came {
  from: string
  scheme: string
  host: string
}

/**
 * What the engine knows of a request and the request itself does not say: the address of the caller, and the
 * scheme and the name the app was reached by, each as the proxy rule gives them. `proxied` says that the request
 * came through a named proxy, so that it is never taken as one of this computer.
 */
export interface About extends Came {
  origin: string
  proxied: boolean
  // The address of the connection itself, whatever a proxy stated: the host of a box is known by it.
  peer?: string
}

/** An address as it is counted and compared: an IPv4 address written inside an IPv6 one is the IPv4 address. */
export function plainAddress(address: string): string {
  const inside = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1]
  return inside && isIPv4(inside) ? inside : address.toLowerCase()
}

/** Whether a request came from this computer, through no proxy. */
export const fromHere = (about: About): boolean => {
  const from = plainAddress(about.from)
  return !about.proxied && (from === '::1' || /^127\.\d+\.\d+\.\d+$/.test(from))
}

/** Whether a request names this computer as its host, by one of its three names, on whatever port. */
export const namesHere = (about: About): boolean =>
  ['localhost', '127.0.0.1', '[::1]'].includes(about.host.toLowerCase().replace(/:\d+$/, ''))

/** The address of one entry of a forwarding header, with its port dropped, or nothing for an entry that is no address. */
function addressOf(entry: string): string | undefined {
  const text = entry.trim().replace(/^"(.*)"$/, '$1')
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(text)?.[1]
  const withPort = /^(\d+\.\d+\.\d+\.\d+):\d+$/.exec(text)?.[1]
  const address = bracketed ?? withPort ?? text
  return isIP(address) ? plainAddress(address) : undefined
}

/** The parts of a header that are parted by a sign, where the sign stands in no quoted text. */
function parted(line: string, sign: string): string[] {
  const parts: string[] = []
  let [part, quoted] = ['', false]
  for (const letter of line) {
    if (letter === '"') quoted = !quoted
    if (letter === sign && !quoted) {
      parts.push(part)
      part = ''
    } else part += letter
  }
  return [...parts, part].map((one) => one.trim()).filter((one) => one !== '')
}

/** One element of the standard `Forwarded` header: its pairs by their names, in lowercase, with the quotes taken off. */
function pairsOf(element: string): Record<string, string> {
  const pairs: Record<string, string> = {}
  for (const pair of parted(element, ';')) {
    const at = pair.indexOf('=')
    if (at > 0)
      pairs[pair.slice(0, at).trim().toLowerCase()] = pair
        .slice(at + 1)
        .trim()
        .replace(/^"(.*)"$/, '$1')
  }
  return pairs
}

/** What each hop of a request stated, in the order of the header: the address, and the scheme and the host where it named them. */
interface Hop {
  for: string
  proto?: string
  host?: string
}

/** The hops that the named family of headers states, the nearest one last. */
function hopsOf(headers: Headers, family: 'x-forwarded' | 'forwarded'): Hop[] {
  if (family === 'forwarded')
    return parted(headers.get('forwarded') ?? '', ',').map((element) => {
      const { for: stated = '', proto, host } = pairsOf(element)
      return { for: stated, ...(proto ? { proto } : {}), ...(host ? { host } : {}) }
    })
  const stated = parted(headers.get('x-forwarded-for') ?? '', ',')
  const protos = parted(headers.get('x-forwarded-proto') ?? '', ',')
  const host = parted(headers.get('x-forwarded-host') ?? '', ',').at(-1)
  // Of several schemes the one that stands with its address counts, and the last one where the two lists differ in length.
  return stated.map((one, i) => {
    const proto = protos.length === stated.length ? protos[i] : protos.at(-1)
    return { for: one, ...(proto ? { proto } : {}), ...(host ? { host } : {}) }
  })
}

/**
 * Takes the proxies that an engine was told of. Answers what works out, for one request, what the engine knows of
 * it: from a named proxy the address is the last one of the named family that is no named proxy, an entry that is
 * no address ends the walk at the proxy it came through, the scheme is `https` unless the options say otherwise,
 * and the host is the request's own unless the options say that the proxy writes it. From any other address no
 * such header is read. The second member says whether an address is a named proxy.
 */
export function proxyRule(o: ProxyOptions | undefined): {
  about(came: Came, headers: Headers): About
  isProxy(address: string): boolean
} {
  const named = new BlockList()
  for (const entry of o?.from ?? []) {
    const [address, prefix] = entry.split('/')
    const family = isIP(address) === 6 ? 'ipv6' : 'ipv4'
    if (prefix === undefined) named.addAddress(address, family)
    else named.addSubnet(address, Number(prefix), family)
  }
  const isProxy = (address: string): boolean => {
    const plain = plainAddress(address)
    return isIP(plain) !== 0 && named.check(plain, isIP(plain) === 6 ? 'ipv6' : 'ipv4')
  }
  const whole = (came: Came, proxied: boolean): About => ({
    ...came,
    origin: `${came.scheme}://${came.host}`,
    proxied,
  })
  return {
    isProxy,
    about(came, headers) {
      const socket = plainAddress(came.from)
      if (!o || !isProxy(socket)) return { ...whole({ ...came, from: socket }, false), peer: socket }
      const hops = hopsOf(headers, o.header ?? 'x-forwarded')
      let from = socket
      let taken: Hop | undefined
      for (const hop of hops.toReversed()) {
        const address = addressOf(hop.for)
        if (address === undefined) break
        taken = hop
        from = address
        if (!isProxy(address)) break
      }
      const stated = o.scheme ?? 'https'
      const scheme = stated === 'header' ? (taken?.proto?.toLowerCase() === 'https' ? 'https' : 'http') : stated
      const host = o.host === true ? (taken?.host ?? hops.findLast((hop) => hop.host)?.host ?? came.host) : came.host
      return { ...whole({ from, scheme, host }, true), peer: socket }
    },
  }
}
