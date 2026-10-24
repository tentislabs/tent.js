import type { App } from '../app.ts'
import { filledCounts } from '../fill/counts.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'

/** `app.filled`: for each column that work fills, how many of its values are missing, old and failed. */
export const member =
  (o: Opened): App['filled'] =>
  () => {
    heldOpen(o)
    return filledCounts(o)
  }
