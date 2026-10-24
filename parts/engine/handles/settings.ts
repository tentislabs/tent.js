import type { Opened } from '../opened.ts'
import { valuesOf } from '../values/ofApp.ts'

/**
 * The working object behind the handle `settings`: one value for each setting of the project, each a member of its
 * own. A setting answers what was set for it in the file of its mode, or its default, and a value that is set
 * while the engine runs is the value of the next read.
 */
export const handle = (o: Opened): object => valuesOf(o).settings.values
