import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Ranker, Seal, Searcher } from '../../data/index.ts'
import { ranker } from '../ai/ranker.ts'
import { secretKeyAt, keyFile, secretKeyIn } from './key.ts'
import { foundText, openText, sealText } from './sealing.ts'

/** What a sealed value is bound to: its table, its column and its row, so that a value moved to another row does not open. */
const boundTo = (bound: string): string => `tent.sealed/1\n${bound}`

/**
 * Takes a key of the secrets, and with it a second one that values may still be sealed under. Answers what seals
 * the value of a `sealed` column before it reaches the store, and opens it after: each value by itself, as a
 * secret is, bound to its place. A value is sealed under the first key, and opened with the one of the two that
 * fits it. `open` throws T0019 for a value that neither opens.
 */
function sealWith(key: Uint8Array, other?: Uint8Array): Seal {
  return {
    close: (value, bound) => sealText(key, JSON.stringify(value), boundTo(bound)),
    find: (value, bound) => foundText(key, JSON.stringify(value), `tent.found/1\n${bound}`),
    open(text, bound) {
      const opened = openText(key, text, boundTo(bound)) ?? (other ? openText(other, text, boundTo(bound)) : undefined)
      if (opened === undefined)
        throw new TentError('T0019', `The sealed value of ${bound} does not open under the key at hand.`, {
          fix: 'Give the engine the key that the value was sealed under, as `TENT_SECRET_KEY` or as `secret.key` of its data folder.',
        })
      return JSON.parse(opened)
    },
  }
}

// The seal of each data folder, once its key was found.
const made = new Map<string, Seal>()

/**
 * Takes a data folder. Answers the seal of its key, or nothing with no key at hand: `data` then says which column
 * could not be read or written. A key that was found is kept. Where a new key lies beside the key, as
 * `secret.key.next`, a value opens under either.
 */
function sealOf(dataFolder: string): Seal | undefined {
  const held = made.get(dataFolder)
  if (held) return held
  const key = secretKeyAt(dataFolder)
  if (!key) return undefined
  const seal = sealWith(key, secretKeyIn(keyFile(dataFolder, '.next')))
  made.set(dataFolder, seal)
  return seal
}

/** Forgets the seal of a data folder: its key is looked for anew, as after it was replaced and when an app opens. */
export function forgetSeal(dataFolder: string): void {
  made.delete(dataFolder)
}

// Whether a description holds a sealed column at all: an app that holds none is never asked for its key.
const seals = new WeakMap<Description, boolean>()

function hasSealed(description: Description): boolean {
  let held = seals.get(description)
  if (held === undefined) {
    held = Object.values(description.tables).some((table) =>
      Object.values(Object(table.columns)).some((type) => Reflect.get(Object(type), 'sealed') === true),
    )
    seals.set(description, held)
  }
  return held
}

// The search of the builder's own of each data folder that is open with one.
const searchers = new Map<string, Searcher>()

/** Is told at the opening of an app the search that a maker made for it, or that it has none. */
export function keepSearcher(dataFolder: string, searcher: Searcher | undefined): void {
  if (searcher) searchers.set(dataFolder, searcher)
  else searchers.delete(dataFolder)
}

/**
 * What `data` is handed of an app for a call, beside its store: the seal of its key, or nothing where the app
 * seals no column or no key is at hand, the search of the builder's own, where a maker made one, and what ranks
 * rows by a model. An app that
 * seals a column and has no key looks for one at each call.
 */
export function sealed(o: {
  dataFolder: string
  description: Description
  machine?: { reader?: object; writes(what: string): void }
}): {
  seal?: Seal
  searcher?: Searcher
  ranker: Ranker
} {
  const held = hasSealed(o.description) ? sealOf(o.dataFolder) : undefined
  // A reader may hold no key, or another than the one a value was sealed under: what it cannot open is the writer's.
  const { machine } = o
  const seal = hasSealed(o.description) && machine?.reader ? onReader(held, (what) => machine.writes(what)) : held
  const searcher = searchers.get(o.dataFolder)
  return { ...(seal ? { seal } : {}), ...(searcher ? { searcher } : {}), ranker }
}

/**
 * The seal of a reader: it opens what its key opens. A value that it cannot open, and every value where it holds
 * no key, makes the request under way one that needs the writer, which the door then hands on. `writes` is what
 * the machine says of work that is its writer's: on a reader it throws the error that hands the request on. The
 * link between machines is named by nothing here, so an app of one machine loads none of it.
 */
function onReader(seal: Seal | undefined, writes: (what: string) => void): Seal {
  const needs = (): Error => {
    writes('a sealed value that this machine cannot open')
    return new TentError('T0019', 'A sealed value does not open under the key at hand.')
  }
  return {
    close(value, bound) {
      if (!seal) throw needs()
      return seal.close(value, bound)
    },
    find(value, bound) {
      if (!seal?.find) throw needs()
      return seal.find(value, bound)
    },
    open(text, bound) {
      if (!seal) throw needs()
      try {
        return seal.open(text, bound)
      } catch (error) {
        throw error instanceof TentError && error.code === 'T0019' ? needs() : error
      }
    },
  }
}

/**
 * What `data` is handed of the key of a data folder, whatever its tables hold: for a table change, which may add
 * a sealed column.
 */
export function sealedAt(dataFolder: string): { seal?: Seal } {
  const seal = sealOf(dataFolder)
  return seal ? { seal } : {}
}
