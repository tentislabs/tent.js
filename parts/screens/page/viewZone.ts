import { scopeNow } from './drawScope.ts'

// The zone of the page that is drawn: a `dayOf` in a view that names no zone takes it. A browser draws one page and
// is told its zone; a server reads the zone of each page from the scope of its draw.
let zone: string | undefined

/** Tells the zone of the page that is drawn now. */
export function zoneIs(told: string | undefined): void {
  zone = told
}

/** The zone of the page that is drawn now, where one was told. */
export const zoneNow = (): string | undefined => {
  const scope = scopeNow()
  return scope ? scope.zone : zone
}
