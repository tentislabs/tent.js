import { reactNames } from '../borrowed/reactNames.ts'
import * as ui from '../index.ts'

/** The six names by which a module finds the page code, each with what that name gives. */
export const names: Record<string, object> = { ...reactNames, 'tentjs/ui': ui }
