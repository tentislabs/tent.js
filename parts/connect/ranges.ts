import { BlockList } from 'node:net'
import type { Read } from './forms.ts'

// The ranges that the registries of special addresses list, which are refused as private or local:
// https://www.iana.org/assignments/iana-ipv4-special-registry and
// https://www.iana.org/assignments/iana-ipv6-special-registry
const v4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.31.196.0/24',
  '192.52.193.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '192.175.48.0/24',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
]
// The forms that carry an IPv4 address inside are not here: such an address is opened, and held to the list above.
const v6 = [
  '::/128',
  '::1/128',
  '64:ff9b:1::/48',
  '100::/64',
  '2001::/23',
  '2001:db8::/32',
  '3fff::/20',
  '5f00::/16',
  'fc00::/7',
  'fe80::/10',
  'fec0::/10',
  'ff00::/8',
]

const refusedRanges = new BlockList()
for (const [list, family] of [
  [v4, 'ipv4'],
  [v6, 'ipv6'],
] as const)
  for (const range of list) {
    const [net = '', prefix] = range.split('/')
    refusedRanges.addSubnet(net, Number(prefix), family)
  }

// The addresses of this computer itself, which the mode `development` may reach.
const ownRanges = new BlockList()
ownRanges.addSubnet('127.0.0.0', 8, 'ipv4')
ownRanges.addAddress('::1', 'ipv6')

/**
 * Takes an address that was read into its one form. Answers where it lies: `'own'` for an address of this
 * computer, `'private'` for any other address of a refused range, also where the IPv4 address that it carries
 * inside is one, and `'open'` for every other address.
 */
export function rangeOf(read: Read): 'open' | 'own' | 'private' {
  const family = read.address.includes(':') ? 'ipv6' : 'ipv4'
  if (ownRanges.check(read.address, family)) return 'own'
  if (refusedRanges.check(read.address, family)) return 'private'
  return read.inside !== undefined && refusedRanges.check(read.inside, 'ipv4') ? 'private' : 'open'
}
