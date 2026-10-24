import type { User } from '../../core/index.ts'
import { useStore } from '../page/context.ts'

/** Answers who looks at the page: `{ id, roles }`, or nothing for a caller who is not signed in. */
export function useUser(): User | undefined {
  return useStore().page.user ?? undefined
}
