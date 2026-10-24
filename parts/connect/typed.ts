/**
 * Takes an address that a person typed for the framework's own fetching: `TENT_RELEASES`, `TENT_PARTS`, `--parts`
 * or `--secure from=`. Answers what lists its host in `privateHosts` for that fetch alone, since it is that
 * person's own word, and a company's copy is nearly always on a private address: the host with its port, and
 * `http://` in front where the address is reached with no secure connection.
 */
export function typedHosts(address: string | URL): string[] {
  const url = new URL(address)
  return [`${url.protocol === 'http:' ? 'http://' : ''}${url.host}`]
}
