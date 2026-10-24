import type { Drawable } from '../borrowed/react.ts'
import { createElement, isValidElement, useContext, useEffect } from '../borrowed/react.ts'
import { HandedContext, PartContext, useStore } from './context.ts'
import type { GiverState } from './ownState.ts'
import { useOwnState } from './ownState.ts'
import { spokenText } from './spoken.ts'
import { StateContext, UnderContext, useViewState } from './states.ts'
import { asked } from './data.ts'
import type { Side, PageStore } from './store.ts'
import { callsOf } from './store.ts'
import type { View } from './refreshing.ts'
import type { Page, ViewRecord } from './types.ts'
import { valueOf } from './valueOf.ts'
import { usePart } from './parts.ts'
import { isStored } from '../../core/internal.ts'

type Names = Record<string, unknown>

/** What every view is handed beside its data: the address, its state, who looks, and what its calls are doing. */
function everyHanded(store: PageStore, view: GiverState, more: Names): Names {
  return {
    state: view.state,
    user: store.page.user ?? undefined,
    language: store.page.language,
    settings: store.page.settings,
    set: (values: Names): void => view.set(values, { press: true }),
    ...more,
  }
}

// The component that each view is drawn through, by the view: one for each, so it is one component at every draw.
const drawings = new WeakMap<View, (o: { handed: Names }) => Drawable>()

/**
 * Takes a view. Answers the component that React draws it through, which hands it what it is handed whole: React
 * keeps `key` from the properties of every component, and a view is handed it as any other name. In development
 * this component is the family that Fast Refresh finds the view by, with the view's signature.
 */
export function drawingOf(view: View): (o: { handed: Names }) => Drawable {
  const held = drawings.get(view)
  if (held) return held
  const made = Object.assign((o: { handed: Names }): Drawable => view(o.handed), { displayName: view.name || 'view' })
  drawings.set(view, made)
  return made
}

/**
 * What a view draws: the view, drawn as a component of its own, so its hooks are its own and the screen around it
 * may wait for an entry and draw nothing; and the component that Fast Refresh draws again in place.
 */
function viewDrawn(record: ViewRecord, handed: Names): Drawable {
  // A browser holds no view of a component that is drawn on the server alone: its part shows what the server drew.
  if (record.browser === false && typeof record.view !== 'function') return null
  if (typeof record.view !== 'function') throw new Error(`The page holds no view of \`${record.name}\`.`)
  return createElement(drawingOf(record.view), { handed })
}

/** The living children of a use: what it holds between its tags, and each property whose value is an element. */
const livingOf = (props: Names, children: Drawable): Record<string, Drawable> => ({
  children,
  ...Object.fromEntries(Object.entries(props).filter(([, value]) => isValidElement(value))),
})

/** The default of a declared property, where a use gave none. */
const defaultOf = (type: unknown): unknown => (isStored(type) && !isStored(type.default) ? type.default : undefined)

/**
 * One use of a component: its view is handed the properties it declares, its own data, what every view is handed,
 * and what the use holds between its tags as `children`, which it places where it wants.
 */
export function Use(o: { record: ViewRecord; given: Names; more?: Names; children?: Drawable }): Drawable {
  const store = useStore()
  const giverHanded = useContext(HandedContext)
  const giver = useViewState()
  const around = useContext(UnderContext)
  // What a use holds between its tags, and a property that holds elements, belong to the view that wrote them: each
  // is drawn with what that view was handed and with the state of that view, wherever the component places it.
  const ofGiver = (drawn: Drawable): Drawable =>
    drawn === undefined || drawn === null ? undefined : (
      <HandedContext.Provider value={giverHanded}>
        <StateContext.Provider value={giver}>
          <UnderContext.Provider value={around}>
            <PartContext.Provider value={undefined}>{drawn}</PartContext.Provider>
          </UnderContext.Provider>
        </StateContext.Provider>
      </HandedContext.Provider>
    )
  // Inside a component that is drawn on the server alone, each living child stands in a place of its own.
  const placed = (drawn: Drawable, name: string): Drawable =>
    o.record.browser === false && drawn !== undefined && drawn !== null
      ? createElement(ChildPlace, { name, children: drawn })
      : drawn
  // The place of the children stands where the part puts them even where it is drawn again alone, with none given.
  const held =
    o.record.browser === false
      ? createElement(ChildPlace, { name: 'children', children: ofGiver(o.children) })
      : ofGiver(o.children)
  const declared = isStored(o.record.props) ? o.record.props : {}
  // A use is told apart by its `id`, with the ids of the uses around it: its state in the address is kept under them.
  const id = typeof o.given.id === 'string' ? o.given.id : undefined
  const under = id === undefined ? undefined : around === undefined ? id : `${around}~${id}`
  const view = useOwnState(o.record, under, store)
  const own: Names = {}
  for (const [name, type] of Object.entries(declared)) own[name] = defaultOf(type)
  for (const [name, value] of Object.entries(o.given)) {
    // A property that is given as nothing is not given: a declared one keeps its default.
    if (value !== undefined && Object.hasOwn(declared, name))
      own[name] = isValidElement(value) ? placed(ofGiver(value), name) : value
  }
  const over = everyHanded(store, view, { ...o.more, props: own })
  const data = asked(o.record, over, store)
  // A page that is streamed draws what stands in the place of a use that waits, and marks one that came.
  if (data.waits) return store.streamed ? store.streamed(o.record.name, data.answers, undefined, o.given) : null
  const handed = everyHanded(store, view, {
    ...o.more,
    ...own,
    ...data.values,
    calls: callsOf({ ...store.calls, ...data.calls }),
    children: held,
  })
  const drawn = (
    <HandedContext.Provider value={handed}>
      <StateContext.Provider value={view}>
        <UnderContext.Provider value={under ?? around}>{viewDrawn(o.record, handed)}</UnderContext.Provider>
      </StateContext.Provider>
    </HandedContext.Provider>
  )
  const shown =
    o.record.browser === false ? (
      <ServedDrawn record={o.record} props={own} living={livingOf(own, held)} answers={data.values}>
        {drawn}
      </ServedDrawn>
    ) : (
      drawn
    )
  return store.streamed ? store.streamed(o.record.name, data.answers, shown, o.given) : shown
}

/**
 * The place of a living child where the component that is drawn on the server alone puts it. Where the part is
 * drawn on a server, the place is an element that takes no room and names the mark of the draw and the property that
 * gave the child: the page brings it to life there.
 */
function ChildPlace(o: { name: string; children: Drawable }): Drawable {
  const mark = useContext(PartContext)
  return mark === undefined
    ? o.children
    : createElement('div', { style: { display: 'contents' }, 'data-t-child': `${mark}:${o.name}` }, o.children)
}

/** A use of a component that is drawn on the server alone: a part of the page code, which a page loads with such a use. */
function ServedDrawn(o: {
  record: ViewRecord
  props: Names
  living: Record<string, Drawable>
  answers: unknown
  children: Drawable
}): Drawable {
  const part = usePart('served')
  return part ? <part.Served {...o} /> : null
}

/**
 * The screen that a page shows, inside each component that it names with `layout`, the outermost first. Such a
 * component places the screen as its `children`, and is handed the values of the address and the screen it wraps.
 */
export function Screen(o: { record: ViewRecord }): Drawable {
  const store = useStore()
  const frames: ViewRecord[] = []
  for (let name = o.record.layout; typeof name === 'string'; ) {
    const frame = store.view(name)
    // A component that leads back to itself is drawn once: the check refuses such a project.
    if (!frame || frames.includes(frame)) break
    frames.push(frame)
    name = frame.layout
  }
  const wraps = {
    name: o.record.name,
    path: store.stub(o.record.name)?.path ?? store.page.path,
    address: store.page.path,
  }
  // A move keeps every component that the old screen and the new one share, from the outermost in: each is
  // told apart by its name, and the screen by its own.
  // While a move takes long, the loading component of the old screen stands in its place.
  const waiting = store.loading?.()
  let drawn: Drawable = waiting ? (
    <Use key={`loading ${waiting.name}`} record={waiting} given={{}} />
  ) : (
    <Own key={o.record.name} record={o.record} />
  )
  for (const frame of frames)
    drawn = (
      <Use key={frame.name} record={frame} given={{}} more={{ params: store.page.params, screen: wraps }}>
        {drawn}
      </Use>
    )
  return drawn
}

/** The view of a screen: it is handed each name of its `data`, and what every view is handed. */
export function Own(o: {
  record: ViewRecord
  // A screen that is opened above the one that is shown: its address and its own state, apart from the page's.
  above?: { params: Record<string, string>; state: Record<string, unknown>; set(values: Record<string, unknown>): void }
  // Is told the title of a screen above, which names its dialog.
  titled?: (title: string) => void
}): Drawable {
  const store = useStore()
  // The state of a screen is the page's: the project's, and its own. A screen above has its own beside the project's.
  const view: GiverState = o.above
    ? { state: { ...store.state, ...o.above.state }, set: (values) => o.above?.set(values) }
    : { state: store.state, set: (values, how) => store.set(values, how ?? { press: true }) }
  const params = o.above?.params ?? store.page.params
  const over = everyHanded(store, view, { params })
  const data = asked(o.record, over, store)
  // The answer of an entry that the server left open is on its way: the view is drawn when it is there.
  if (data.waits) return null
  const handed = everyHanded(store, view, {
    ...data.values,
    params,
    calls: callsOf({ ...store.calls, ...data.calls }),
    above: o.above !== undefined,
    ...(store.page.error && !o.above ? { error: store.page.error } : {}),
    ...(store.page.grant && !o.above ? { grant: store.page.grant } : {}),
    ...(store.page.ask && !o.above ? { ask: store.page.ask } : {}),
  })
  // The title is worked out from the screen and its answers, as the server works it out for the first HTML.
  const title =
    typeof o.record.title === 'function'
      ? o.record.title(handed)
      : valueOf(o.record.title, { names: handed, asset: store.asset })
  return (
    <HandedContext.Provider value={handed}>
      <StateContext.Provider value={view}>
        <UnderContext.Provider value={undefined}>
          <Titled
            title={
              spokenText(title, store.words, store.page.language) ??
              (title === undefined || title === null ? '' : String(title))
            }
            told={o.titled}
          />
          {viewDrawn(o.record, handed)}
        </UnderContext.Provider>
      </StateContext.Provider>
    </HandedContext.Provider>
  )
}

/** Gives the document the title of the screen that is shown: after a move, and when a row that the title reads changes. */
function Titled(o: { title: string; told?: ((title: string) => void) | undefined }): Drawable {
  const { title, told } = o
  useEffect(() => {
    // The title of a screen above names its dialog, and the document keeps the title of the screen underneath.
    if (told) return told(title)
    if (typeof document !== 'undefined' && document.title !== title) document.title = title
  }, [title, told])
  return null
}

/** A screen opened above the one that is shown: a part of the page code, which a page loads the first time it opens one. */
function AboveDrawn(o: {
  record: ViewRecord
  upper: { page: Page; state: Record<string, unknown>; set(values: Record<string, unknown>): void; side?: Side }
}): Drawable {
  const part = usePart('above')
  return part ? <part.Above record={o.record} upper={o.upper} /> : null
}

/**
 * The screen that a living page shows now: when the page takes the record of another screen, that screen is
 * drawn in its place. A view starts anew where the page follows another version by asking for its screen again,
 * and where the screen is mounted anew; a swap of Fast Refresh keeps it, and draws it again in place.
 */
export function Shown(): Drawable {
  const store = useStore()
  const record = store.screen()
  // What was drawn is told once it stands: the page watches what it shows, and no more.
  useEffect(() => store.drawn())
  if (!record) return null
  // A component that a test opens alone is drawn with the props it was given, and nothing around it.
  const alone = store.page.alone
  if (alone) return <Use key={record.name} record={record} given={alone.props} />
  const over = store.upper?.()
  const upper = over ? store.view(over.page.screen) : undefined
  return (
    <>
      <Screen key={record.view ? String(store.anew?.() ?? 0) : ''} record={record} />
      {over && upper ? <AboveDrawn key={over.page.path} record={upper} upper={over} /> : null}
    </>
  )
}
