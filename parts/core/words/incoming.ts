import type { Definition, Marker } from '../definition.ts'
import { record } from '../definition.ts'
import type { Secret } from '../helpers/references.ts'
import type { Scheme } from './service.ts'

/** The options of `incoming`. */
interface IncomingOptions {
  path: string
  then: Marker
  verify?: Marker | { scheme: Scheme; secret: Secret }
  open?: string
  limits?: { size?: string }
  was?: string | readonly string[]
}

/** What `incoming` returns: a record that carries its options. */
type IncomingDefinition<Name extends string> = Definition<'incoming', Name, IncomingOptions>

/**
 * Takes the name of an incoming call and its options, of which `path`, `then` and one of `verify` and `open` are
 * required. Answers the definition, which only records them.
 */
export function incoming<const Name extends string>(name: Name, o: IncomingOptions): IncomingDefinition<Name>
export function incoming(name: string, o: object): object {
  return record('incoming', name, o)
}
