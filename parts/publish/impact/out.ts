import type { Description } from '../../core/internal.ts'
import { isStored, providerAddresses, sendsOut } from '../../core/internal.ts'
import type { ImpactLine } from './face.ts'
import { fileOf, kindOf, recordsOf } from './read.ts'

/** The host of an address, or of a name of the web written alone, or nothing where it is neither. */
function hostOf(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  const address = url.includes('://') ? url : `https://${url}`
  return URL.canParse(address) ? new URL(address).host : undefined
}

/**
 * Every outside host a description names, each with the definition that names it: the address of a service, the
 * address of a model or of its provider, and each entry of `hosts` of the project.
 */
function hostsOf(description: Description): Map<string, { name: string; kind: string }> {
  const found = new Map<string, { name: string; kind: string }>()
  const add = (host: string | undefined, name: string, kind: string): void => {
    if (host && !found.has(host)) found.set(host, { name, kind })
  }
  for (const [name, record] of Object.entries(recordsOf(description, 'services')))
    add(hostOf(record.url), name, 'service')
  for (const [name, record] of Object.entries(recordsOf(description, 'models'))) {
    const provider = typeof record.provider === 'string' ? providerAddresses[record.provider] : undefined
    add(hostOf(record.url ?? provider), name, 'model')
  }
  const listed: unknown = Reflect.get(Object(description.project), 'hosts')
  const app = String(Reflect.get(Object(description.app), 'name') ?? '')
  for (const one of Array.isArray(listed) ? listed : []) add(hostOf(one), app, 'project')
  return found
}

/** The tools an agent runs without asking a person first: those it trusts. */
function trustedOf(description: Description, agent: string): string[] {
  const trust: unknown = Reflect.get(Object(recordsOf(description, 'flows')[agent]?.agent), 'trust')
  return Array.isArray(trust) ? trust.map(String) : []
}

/**
 * Takes the description that runs and the one that would follow it. Answers what now sends data out or asks a
 * person no more: a function or a flow that now sends, a tool that an agent no longer asks a person about
 * before it runs, and a host that no service, model or `hosts` of the running version reaches.
 */
export function outOf(live: Description, next: Description): ImpactLine[] {
  const found: ImpactLine[] = []
  for (const part of ['functions', 'flows'])
    for (const name of Object.keys(recordsOf(next, part)))
      if (sendsOut(next, name) && !sendsOut(live, name))
        found.push({ name, kind: kindOf(next, name), file: fileOf(next, name), change: 'now sends data out' })
  for (const [agent, record] of Object.entries(recordsOf(next, 'flows'))) {
    if (!isStored(record.agent) || !recordsOf(live, 'flows')[agent]) continue
    const before = trustedOf(live, agent)
    for (const tool of trustedOf(next, agent))
      if (!before.includes(tool))
        found.push({
          name: `${agent}.${tool}`,
          kind: 'tool',
          file: fileOf(next, agent),
          change: 'no longer asks a person first',
        })
  }
  const reached = hostsOf(live)
  for (const [host, { name, kind }] of hostsOf(next))
    if (!reached.has(host)) found.push({ name, kind, file: fileOf(next, name), change: `a new outside host, ${host}` })
  return found
}
