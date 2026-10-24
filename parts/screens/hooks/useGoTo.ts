import { addressOf } from '../page/address.ts'
import { useStore } from '../page/context.ts'
import type { ScreenDefinition } from '../screen.ts'

/**
 * Answers `goTo(target, values, { replace })`: `target` is a screen, a path of the app, or `'#<id>'`, and
 * `values` are the values of the screen's address and of the state it keeps in the address. It moves the page to
 * the address with no load of the document: after the page in the history of the browser, or with `replace` in its
 * place. A target that is no address of the app goes nowhere.
 */
export function useGoTo(): (
  target: ScreenDefinition | string,
  values?: Record<string, unknown>,
  o?: { replace?: boolean },
) => void {
  const store = useStore()
  return (target, values, o) => {
    const address = addressOf(target, values, store.stub)
    if (address !== undefined) store.goTo(address, o)
  }
}
