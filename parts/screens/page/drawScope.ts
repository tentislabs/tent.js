/**
 * What a server's draw of one page tells the code it runs: the zone of the page. A browser draws one page and holds
 * none of it: there it is never told.
 */
export interface DrawScope {
  zone: string | undefined
}

let reader: (() => DrawScope | undefined) | undefined

/** Takes what reads the scope of the draw that runs now: a server draws many pages at once, each in a scope of its own. */
export function scopeReadBy(read: () => DrawScope | undefined): void {
  reader = read
}

/** The scope of the server's draw that runs now, where one runs. */
export const scopeNow = (): DrawScope | undefined => reader?.()
