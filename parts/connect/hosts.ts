import { hostOf } from './forms.ts'

/**
 * One line of a list of hosts, read: the host, the one port that is meant where one was written, whether it was
 * written with http:// in front, and whether it names every name under the host, as `*.example.com` does.
 */
export interface Line {
  host: string
  port?: number
  plain: boolean
  under: boolean
}

/** Reads one line of a list of hosts. A line that reads as no host names nothing. */
function lineOf(written: string): Line | undefined {
  const lower = written.trim().toLowerCase()
  const rest = lower.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const under = rest.startsWith('*.')
  const host = hostOf(under ? rest.slice(2) : rest)
  if (!host || host.empty) return undefined
  return {
    host: host.host,
    ...(host.port === undefined ? {} : { port: host.port }),
    plain: lower.startsWith('http://'),
    under,
  }
}

/**
 * Takes a list of hosts as a project writes it, what is asked for, a host with its port where it has one, and the
 * addresses that it means. Answers the first line that lists it: by the host as it is asked, or by one of its
 * addresses, on every port or on the one port that the line names. Answers nothing where no line does.
 */
export function listedIn(
  list: readonly string[] | undefined,
  asked: { host: string; port?: number },
  addresses: readonly string[] = [],
): Line | undefined {
  for (const written of list ?? []) {
    const line = lineOf(written)
    if (!line || (line.port !== undefined && line.port !== asked.port)) continue
    if (line.under ? asked.host.endsWith(`.${line.host}`) : line.host === asked.host || addresses.includes(line.host))
      return line
  }
  return undefined
}
