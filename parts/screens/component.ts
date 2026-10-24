import type { Definition, Given, Handed, Type } from '../core/index.ts'
import { isStored, record } from '../core/internal.ts'
import type { Drawable } from './borrowed/react.ts'
import { createElement } from './borrowed/react.ts'
import type { DataHanded, DataValues, EveryHanded, StateFields } from './handed.ts'
import type { DataEntries } from './screen.ts'
import type { ViewRecord } from './page/types.ts'
import { Use } from './page/view.tsx'
import type { Travelled } from './travelled.ts'

/** The properties a component declares, each a type by its name. */
type PropFields = { readonly [name: string]: Type }

/** Whether an option is a view: a function that is handed what a view is handed. */
const isView = (value: unknown): value is (handed: Record<string, unknown>) => Drawable => typeof value === 'function'

/** The properties of a component as its view is handed them. */
type PropsHanded<Props> = { -readonly [Name in keyof Props]: Travelled<Handed<Props[Name]>> }

/** The properties of a component as a use of it gives them: one that is optional or has a default may be left out. */
type PropsGiven<Props> = {
  -readonly [Name in keyof Props as undefined extends Given<Props[Name]> ? never : Name]: Given<Props[Name]>
} & { -readonly [Name in keyof Props as undefined extends Given<Props[Name]> ? Name : never]?: Given<Props[Name]> }

/** What the view of a component is handed: its properties, its data, what every view is handed, and what it holds. */
type ComponentHanded<Props, Data, State> = PropsHanded<Props> &
  DataValues<Data> &
  Omit<EveryHanded<State, 'anyone'>, 'params' | 'above'> & { children?: Drawable }

/** The options of `component`. */
export interface ComponentOptions<Props, Data, State> {
  props?: Props
  state?: State
  data?: Data | ((handed: DataHanded<State> & { props: PropsHanded<Props> }) => Data)
  view: (handed: ComponentHanded<Props, Data, State>) => Drawable
  layout?: string | { readonly definition: string; readonly kind: 'component' }
  browser?: false
  // Answers each visitor their own, as the build cannot see in a view.
  personal?: true
  was?: string | readonly string[]
}

/** What `component` returns: something React can draw, so that it stands as a tag, which carries its options too. */
export type ComponentDefinition<Name extends string, Props, Options = object> = ((
  // A use gives its declared properties, `children`, which its view places where it wants, and an `id`, under which
  // its state kept in the address and in the browser is kept.
  props: PropsGiven<Props> & { children?: Drawable; id?: string },
) => Drawable) &
  Definition<'component', Name, Options>

/**
 * Takes the name of a component, which starts with a capital letter, and its options, of which `view` is required.
 * Answers the definition, which records them and is drawn as a tag: it draws its view with what it was given.
 */
export function component<
  const Name extends string,
  const Props extends PropFields = Record<never, never>,
  const Data extends DataEntries = Record<never, never>,
  const State extends StateFields = Record<never, never>,
>(
  name: Name,
  o: ComponentOptions<Props, Data, State>,
): ComponentDefinition<Name, Props, ComponentOptions<Props, Data, State>>
export function component(name: string, options: object): object {
  const made = record('component', name, options)
  const o: Record<string, unknown> = { ...options }
  const view = o.view
  // As a tag in a view it is one use of itself: the page hands its view what every view is handed.
  const drawn: ViewRecord = {
    name,
    kind: 'component',
    data: o.data,
    ...(isStored(o.props) ? { props: o.props } : {}),
    ...(isStored(o.state) ? { state: o.state } : {}),
    ...(o.browser === false ? { browser: false as const } : {}),
    // The view itself is what React draws, so it is the component that Fast Refresh finds by its family.
    ...(isView(view) ? { view } : {}),
  }
  const draw = ({ children, ...given }: Record<string, unknown> & { children?: Drawable }): Drawable =>
    createElement(Use, { record: drawn, given }, children)
  return Object.assign(draw, made)
}
