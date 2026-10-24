import { useStore } from './context.ts'
import type { Above } from './above/above.tsx'
import type { FormDrawn } from './form/form.tsx'
import type { ImageDrawn } from './image/image.tsx'
import type { engineBehind, exportedFile, noEngine } from './exported/exported.ts'
import type { whenAlive } from './inspect/marks.ts'
import type { hiddenToken, tokenOn } from './inspect/token.ts'
import type { scriptsDue } from './scripts/scripts.ts'
import type { markOn, overlayOn } from './overlay/overlay.ts'
import type { thrown } from './overlay/thrown.ts'
import type { FollowedRuns } from './followed.ts'
import type { PageStore } from './store.ts'
import type { Served } from './served/served.tsx'
import type { called, viewWords } from './values/values.ts'
import type { record } from './mic/mic.ts'
import type { Measuring } from './vitals/vitals.ts'
import type { watched } from './tested/tested.ts'

/**
 * The parts of the page code that a page loads only when it needs them, each by its name, with what it gives the
 * main file. A server holds them all.
 */
export interface Parts {
  // A screen opened above the one that is shown.
  above: { Above: typeof Above }
  // The tag `Form`, with the check it holds its fields to.
  form: { Form: typeof FormDrawn }
  // The tag `Image`, through the image door.
  image: { Image: typeof ImageDrawn }
  // What records the microphone for `useMicrophone`.
  mic: { record: typeof record }
  // What adds the scripts of the head that load once the page lives, when the browser is idle, or on a consent.
  scripts: { due: typeof scriptsDue }
  // What an exported page reaches its engine through, where one stands behind its address.
  exported: { engineBehind: typeof engineBehind; exportedFile: typeof exportedFile; noEngine: typeof noEngine }
  // What tells a tool which element is pointed at and takes its orders, in the inspect mode, and the token on an
  // address that is loaded whole and in a form.
  inspect: {
    on: typeof tokenOn
    fields: typeof hiddenToken
    alive: typeof whenAlive
  }
  // What a page in the mode `test` tells the test that drives it: when what a step set off has landed, and what the
  // screen holds by name. It is loaded only where a test laid its record into the page.
  tested: { watched: typeof watched }
  // What measures the speed a visitor sees, loaded when the browser is idle, for a share of the page views.
  vitals: { measure(o: Measuring): void }
  // What shows the findings of development over a page in that mode, tells the engine of a view that failed, and
  // shows the mark of what a swap of Fast Refresh kept.
  overlay: { overlayOn: typeof overlayOn; thrown: typeof thrown; markOn: typeof markOn }
  // What follows the runs that a page follows over its live connection.
  agent: { followedRuns(send: (message: object) => boolean): FollowedRuns }
  // What sends a press of the engine's own, on a screen that is handed `grant` or `ask`.
  posted: { postedBy(call: unknown): ((store: PageStore) => Promise<string>) | undefined }
  // The value words that a screen's arrows may hold, and what works out a stored call of one.
  values: { words: typeof viewWords; called: typeof called }
  // A use of a component that is drawn on the server alone.
  served: { Served: typeof Served }
}

/** The name of a part of the page code. */
export type PartName = keyof Parts

const held: Partial<Parts> = {}

/** Takes the name of a part and what it gives. Holds it: from then on the tags of the main file draw with it. */
export function holdPart<Name extends PartName>(name: Name, part: Parts[Name]): void {
  held[name] = part
}

/** What a part gives, where it is held, for code that draws nothing: a page that loads it waits for it first. */
export const partHeld = <Name extends PartName>(name: Name): Parts[Name] | undefined => held[name]

/**
 * Takes the name of a part. Answers what it gives, or nothing while it is not loaded: a page then loads it, and
 * is drawn again when it is there. So a view that needs a part the build could not see loads it when it first
 * draws the tag.
 */
export function usePart<Name extends PartName>(name: Name): Parts[Name] | undefined {
  const store = useStore()
  const part = partHeld(name)
  if (!part) store.needs?.(name)
  return part
}
