import { isIPv6 } from 'node:net'

/** A host as it is compared: in lowercase, and without the usual port of its scheme. */
function plainHost(host: string, usual: string[]): string {
  const lower = host.trim().toLowerCase()
  const port = /:(\d+)$/.exec(lower)?.[1]
  return port !== undefined && usual.includes(port) ? lower.slice(0, -port.length - 1) : lower
}

/**
 * Takes the names an app was given, `address` of `engine.open`, and the port of the engine. Answers what says
 * whether a request names the app: with no name given, only this computer by its three names on the port of the
 * engine; with names of its own, those, each with its port where that is not the usual one; and with `'*'` every
 * name.
 */
export function namesOf(
  address: string | string[] | undefined,
  port: number,
): (host: string, scheme: string) => boolean {
  if (address === '*') return () => true
  const given =
    address === undefined ? ['localhost', '127.0.0.1', '[::1]'].map((name) => `${name}:${port}`) : [address].flat()
  const names = new Set(given.map((name) => plainHost(name, ['80', '443'])))
  return (host, scheme) => names.has(plainHost(host, [scheme === 'https' ? '443' : '80']))
}

/**
 * Takes an address. Answers what it is counted by, wherever the engine counts by address: an address of the newer
 * kind is its first 64 bits, so that one sender with a whole network of addresses has one count.
 */
export function countedAs(address: string): string {
  if (!isIPv6(address)) return address
  const [head, tail = ''] = address.split('::')
  const [front, back] = [head.split(':').filter(Boolean), tail.split(':').filter(Boolean)]
  const groups = address.includes('::')
    ? [...front, ...Array(8 - front.length - back.length).fill('0'), ...back]
    : front
  return groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')
}
