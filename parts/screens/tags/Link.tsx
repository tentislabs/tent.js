import { isStored, stateEntries, writeAddress } from '../../core/internal.ts'
import type {
  AnchorHTMLAttributes,
  FocusEvent,
  MouseEvent,
  PointerEvent,
  ReactElement,
  Ref,
} from '../borrowed/react.ts'
import { createElement, useEffect, useRef } from '../borrowed/react.ts'
import { addressOf, loadedWhole, slashedIn, spokenIn } from '../page/address.ts'
import { named } from '../page/based.ts'
import { useStore } from '../page/context.ts'
import { isCurrent } from '../page/current.ts'
import type { PageStore } from '../page/store.ts'
import { useViewState } from '../page/states.ts'
import type { ScreenDefinition } from '../screen.ts'

/** Where a move goes: a screen, a path of the app, or a place on the screen that is shown. */
export type Target = ScreenDefinition | `/${string}` | `#${string}`

/** The properties of `Link`: those of an `<a>` but its address, and what says where it goes and how. */
export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  // A screen, a path of the app, or '#<id>'; left out only beside `language`, or beside `set` alone.
  to?: Target
  // The values of the address and the address state of the screen it goes to.
  with?: Record<string, unknown>
  // Declared state that is set, then the move is made.
  set?: Record<string, unknown>
  // What prefetches the screen: 'hover' when left out.
  prefetch?: 'hover' | 'view' | 'none'
  // The page stays where it is scrolled, and the focus where it was.
  keep?: boolean
  above?: true | { side: 'top' | 'bottom' | 'start' | 'end' }
  // Current on its own address alone.
  exact?: boolean
  // With `to`: that language; alone: this screen in that language.
  language?: string
  ref?: Ref<HTMLAnchorElement>
}

/** The address of the screen that is shown, with the states that it and the project keep in the address, `set` over them. */
function shownWith(store: PageStore, state: Record<string, unknown>, set: Record<string, unknown>): string {
  const record = store.view(store.page.screen)
  const entries = { ...stateEntries(record?.shared), ...stateEntries(record?.state) }
  const search = new URLSearchParams(writeAddress(entries, { ...state, ...set })).toString()
  return search ? `${store.page.path}?${search}` : store.page.path
}

/** Whether a press asks the browser for more than a move: another tab, a window, a saved link. */
const isBrowsers = (event: MouseEvent<HTMLAnchorElement>, target: string | undefined): boolean =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey ||
  (target !== undefined && target !== '' && target !== '_self')

/**
 * A link that knows the screens: one `<a>` whose address is the one that `to` and `with` give, in the language of
 * the page, held to the rule of a path. A press is a move inside the page; one that the browser would open
 * elsewhere is the browser's. It carries `aria-current="page"` while what is shown is where it goes. An address
 * that the rule refuses draws no link, and a press on it makes no move.
 */
export function Link(given: LinkProps): ReactElement {
  const {
    to,
    with: values,
    set,
    prefetch,
    keep,
    above,
    exact,
    language,
    ref,
    onClick,
    onPointerEnter,
    onFocus,
    ...rest
  } = given
  const store = useStore()
  const view = useViewState()
  const element = useRef<HTMLAnchorElement | null>(null)
  const alone = to === undefined && language !== undefined
  const states = isStored(set) ? set : undefined
  const address =
    to === undefined
      ? alone || states
        ? shownWith(store, view.state, states ?? {})
        : undefined
      : addressOf(to, values, store.stub)
  const spoken = language ?? store.page.language
  const whole = address !== undefined && loadedWhole(address, store.page.routes)
  const written =
    address === undefined
      ? undefined
      : whole || address.startsWith('#')
        ? address
        : spokenIn(store.slashed ? slashedIn(address) : address, spoken, store.page.languages)
  const current =
    address !== undefined &&
    spoken === store.page.language &&
    (alone || (to !== undefined && isCurrent(address, { to, with: values, exact }, store, view.state)))
  // A screen is prefetched for a move when the link is hovered or takes the focus, or comes into view.
  // A link that sets state prefetches nothing: what it would fetch holds the state before the set.
  const target =
    address !== undefined && to !== undefined && !states && prefetch !== 'none' && !address.startsWith('#')
      ? spokenIn(address, spoken, store.page.languages)
      : undefined
  const prefetchTarget = (): void => {
    if (target !== undefined) store.prefetch?.(target)
  }
  // One watcher for one target: a link drawn again watches on, and one that fetched its target watches no more.
  useEffect(() => {
    const at = element.current
    if (prefetch !== 'view' || target === undefined || !at || typeof IntersectionObserver === 'undefined')
      return undefined
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((one) => one.isIntersecting)) return
      watcher.disconnect()
      store.prefetch?.(target)
    })
    watcher.observe(at)
    return () => watcher.disconnect()
  }, [prefetch, target, store])
  return createElement('a', {
    ...rest,
    ...(written === undefined ? {} : { href: named(store.page, written) }),
    ...(current ? { 'aria-current': 'page' as const } : {}),
    ref: (at: HTMLAnchorElement | null) => {
      element.current = at
      if (typeof ref === 'function') ref(at)
      else if (ref) ref.current = at
    },
    onPointerEnter: (event: PointerEvent<HTMLAnchorElement>) => {
      onPointerEnter?.(event)
      if (prefetch === undefined || prefetch === 'hover') prefetchTarget()
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      onFocus?.(event)
      if (prefetch === undefined || prefetch === 'hover') prefetchTarget()
    },
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event)
      if (written === undefined) {
        event.preventDefault()
        return
      }
      if (isBrowsers(event, rest.target)) return
      event.preventDefault()
      if (states) view.set(states, { press: true })
      if (to === undefined && !alone) return
      store.goTo(address ?? written, {
        language: spoken,
        ...(keep === true ? { keep: true } : {}),
        ...(above === undefined ? {} : { above: true }),
        ...(above === undefined || above === true ? {} : { side: above.side }),
      })
    },
  })
}
