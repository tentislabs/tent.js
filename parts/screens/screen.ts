import type { asset, Definition, Message } from '../core/index.ts'
import { record } from '../core/internal.ts'
import type { Drawable } from './borrowed/react.ts'
import type { Access, DataHanded, StateFields, ViewHanded } from './handed.ts'
import type { Read } from './read.ts'

/** The entries of `data`, each a `read(...)` by its name. */
export type DataEntries = { readonly [name: string]: Read }

/** A value of a screen that is text, or an arrow over what the view is handed that gives one value. */
type Worked<Handed, Value> = Value | ((handed: Handed) => Value)

/** One line of the head: a `meta`, a `link` or a `script`, with the names its kind takes. */
export type HeadLine =
  | { meta: { name?: string; property?: string; content?: string; media?: string } }
  | {
      link: {
        rel?: 'icon' | 'apple-touch-icon' | 'manifest' | 'alternate' | 'preconnect' | 'dns-prefetch' | 'preload'
        href?: string | ReturnType<typeof asset>
        type?: string
        sizes?: string
        media?: string
        hreflang?: string
        title?: string
        as?: string
        crossorigin?: string
      }
    }
  | {
      script: {
        src?: string | ReturnType<typeof asset>
        async?: boolean
        defer?: boolean
        type?: string
        load?: 'now' | 'alive' | 'idle'
        // The name of a declared true-or-false state: the script is added while it is true, and at no other time.
        consent?: string
      }
    }

/** A component where an option names one: the component itself, or its name. */
type Named = string | { readonly definition: string; readonly kind: 'component' }

/** The options of `screen`. */
export interface ScreenOptions<Data, State, Rule> {
  path?: string
  for?: 'notFound' | 'error' | 'grant' | 'ask'
  access: Rule
  state?: State
  data?: Data | ((handed: DataHanded<State>) => Data)
  // A title is text, or a word, which is written in the language of the page.
  title?: Worked<ViewHanded<Data, State, Rule>, string | Message>
  view: (handed: ViewHanded<Data, State, Rule>) => Drawable
  about?: string
  layout?: Named
  loading?: Named
  cache?: string | number | { for: string | number; public?: boolean }
  server?: false
  seo?: {
    description?: Worked<ViewHanded<Data, State, Rule>, string | Message>
    // Or a component drawn into the picture of a shared link, handed the screen's answers.
    image?:
      | Worked<ViewHanded<Data, State, Rule>, string | ReturnType<typeof asset>>
      | { view: Named; size?: readonly [number, number] }
    index?: boolean
    data?: Worked<ViewHanded<Data, State, Rule>, unknown>
    addresses?: Read
  }
  head?: readonly HeadLine[]
  offer?: readonly ('api' | 'mcp' | 'cli')[]
  framedBy?: readonly string[] | 'anyone'
  was?: string | readonly string[]
}

/** What `screen` returns: a record that carries its options. The build reads it, and nothing calls it. */
export type ScreenDefinition<Name extends string = string, Options = object> = Definition<'screen', Name, Options>

/**
 * Takes the name of a screen and its options, of which `view`, `access` and one of `path` and `for` are required.
 * Answers the definition, which only records them.
 */
export function screen<
  const Name extends string,
  const Data extends DataEntries = Record<never, never>,
  const State extends StateFields = Record<never, never>,
  const Rule extends Access = Access,
>(name: Name, o: ScreenOptions<Data, State, Rule>): ScreenDefinition<Name, ScreenOptions<Data, State, Rule>>
export function screen(name: string, o: object): object {
  return record('screen', name, o)
}
