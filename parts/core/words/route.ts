import type { User } from '../caller.ts'
import type { ActionDb } from '../db.ts'
import type { Definition } from '../definition.ts'
import { record } from '../definition.ts'
import type { AnyoneRule, Rule } from '../helpers/rules.ts'
import type { SystemCall } from './shared.ts'

/** What the `run` of a route is handed. */
interface RouteHanded {
  request: Request
  params: Record<string, string>
  user: User | undefined
  db: ActionDb
  about: { from: string; origin: string }
  call: SystemCall
}

/** The options of `route`. */
interface RouteOptions {
  method: string | readonly string[]
  path: string
  access: Rule
  run: (o: RouteHanded) => Response | Promise<Response>
  system?: string
  origins?: readonly string[] | AnyoneRule
  limits?: { time?: string; size?: string }
  was?: string | readonly string[]
}

/** What `route` returns: a record that carries its options. */
type RouteDefinition<Name extends string> = Definition<'route', Name, RouteOptions>

/**
 * Takes the name of a route and its options, of which `method`, `path`, `access` and `run` are required. Answers
 * the definition, which only records them.
 */
export function route<const Name extends string>(name: Name, o: RouteOptions): RouteDefinition<Name>
export function route(name: string, o: object): object {
  return record('route', name, o)
}
