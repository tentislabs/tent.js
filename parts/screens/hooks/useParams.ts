import { useStore } from '../page/context.ts'

/** Answers the values of the address of the screen that is shown, each as text. */
export function useParams(): Record<string, string> {
  return useStore().page.params
}
