import type { Caller } from '../../core/index.ts'
import { keyIn } from '../keys/caller.ts'
import type { Opened } from '../opened.ts'

/**
 * The way of telling who calls that is a key of a program: asked after a session, and before `identify`. A key
 * with a right is a caller at the addresses that ask for its right alone, and nobody here.
 */
export const caller = {
  order: 4,
  find(request: Request, app: Opened): Caller | undefined {
    const found = keyIn(app, request)
    return found?.key.rights ? undefined : found?.caller
  },
}
