import { createContext, useContext } from '../borrowed/react.ts'
import { useStore } from './context.ts'
import type { GiverState } from './ownState.ts'

/** The state of the view that a tag is written in, and what changes it: a use of a component has its own. */
export const StateContext = createContext<GiverState | undefined>(undefined)

/** The `id` of the use of a component that a tag is drawn inside, with the ids of the uses around it, joined by tildes. */
export const UnderContext = createContext<string | undefined>(undefined)

/**
 * Answers the state that the view of the tag that asks reads, and what changes it: the screen's and the
 * project's on a screen, and its own beside the project's inside a component.
 */
export function useViewState(): GiverState {
  const store = useStore()
  const view = useContext(StateContext)
  return view ?? { state: store.state, set: (values, how) => store.set(values, how ?? { press: true }) }
}
