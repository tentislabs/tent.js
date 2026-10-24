import type { Description } from '../core/internal.ts'
import { storedLimit } from './limits.ts'
import type { Store } from '../data/index.ts'
import { here, metaTable } from '../data/index.ts'
import type { Opened } from './opened.ts'

const system = { kind: 'system' } as const

/** What a data file says of itself under one key of `_t_meta`, or nothing. */
export function metaOf(store: Store, key: string): unknown {
  const row = store.read({ from: metaTable.name, one: 'get', id: key }, system).value
  return typeof row === 'object' && row !== null && !Array.isArray(row) ? row.value : undefined
}

/** Whether two addresses are one, whatever stands at their end. Nothing is no address. */
export const sameAddress = (one: string | undefined, other: string | undefined): boolean =>
  one !== undefined && other !== undefined && one.replace(/\/+$/, '') === other.replace(/\/+$/, '')

/** The number of the last write that the data of a machine holds. */
export const numberOf = (store: Store): number => Number(metaOf(store, 'n') ?? 0)

/** The number of the last write that an app holds: of an app that keeps a data file for each tenant, the highest that any of its files holds. */
export const heldBy = (o: Pick<Opened, 'store' | 'tenantFiles'>): number => o.tenantFiles?.number() ?? numberOf(o.store)

/**
 * The place of a machine among the machines of its app: the number it holds, and the running fingerprint at that
 * number. Of an app that keeps a data file for each tenant it is the newest kept change, with the `sum` of the
 * file that change is of, or what the shared file came with where no change is kept yet.
 */
export const placeOf = (o: Pick<Opened, 'store' | 'tenantFiles'>): { n: number; sum: string } =>
  o.tenantFiles?.place() ?? { n: numberOf(o.store), sum: here(o.store).sum }

/** The epoch that the data of a machine stands in, as `<number>.<writer id>`. */
export function epochOf(store: Store): string {
  const [number, writer] = [metaOf(store, 'epoch'), metaOf(store, 'writer')]
  return `${typeof number === 'number' ? number : 1}.${typeof writer === 'string' ? writer : here(store).id}`
}

/** Whether the data of a machine names the writer of its epoch: a file that was never written under kept changes names none yet. */
export const namesWriter = (store: Store): boolean => typeof metaOf(store, 'writer') === 'string'

/** The version that the data of a machine names as the running one, or nothing where it names none yet. */
export function versionOf(store: Store): string | undefined {
  const version = metaOf(store, 'version')
  return typeof version === 'string' ? version : undefined
}

/** The number of an epoch that is told as `<number>.<writer id>`, and 0 for a text that is none. */
export function epochNumber(epoch: unknown): number {
  const number = typeof epoch === 'string' ? Number(epoch.split('.')[0]) : Number.NaN
  return Number.isInteger(number) && number > 0 ? number : 0
}

/** Whether one epoch is newer than another: by its number, and for one number by the higher id of its writer. */
export function newer(one: string, other: string): boolean {
  const [a, b] = [epochNumber(one), epochNumber(other)]
  if (a !== b) return a > b
  return one.slice(one.indexOf('.') + 1) > other.slice(other.indexOf('.') + 1)
}

/** The limits of an app on many machines, by their names. */
export type ManyLimit =
  | 'beat'
  | 'behind'
  | 'catchUp'
  | 'dial'
  | 'sinkSize'
  | 'sinkWait'
  | 'changesKept'
  | 'handedPerMinute'
  | 'versionWait'

/** Answers a limit of an app on many machines: what the project states, as it is stored, or what holds where it states none. */
export const manyLimit = (description: Description, name: ManyLimit): number => storedLimit(description, name)
