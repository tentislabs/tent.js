// What the part `refresh` lays on a page of development before the main file runs: React's own runtime of Fast
// Refresh, as `__tentRefresh` of the page, which each module of development reaches by the two names that the
// builder's transform writes, and the main file by this.
import type { Drawable } from '../borrowed/react.ts'

/** A view of a screen or a component, as the page draws it. */
export type View = (handed: Record<string, unknown>) => Drawable

/** The runtime of Fast Refresh, as a page of development holds it. */
export interface Refreshing {
  // Registers a component under its family, by the place of its file and its name; `reset` mounts it anew at every save.
  // A view, whose name ends in `$view`, is registered as the component the page draws it through.
  register(type: unknown, id: string, reset: boolean): void
  // Is told by the main file, as it starts, the component the page draws a view through.
  views(drawing: (view: View) => unknown): void
  // What the transform signs the hooks of a component with; with `reset` every one is mounted anew at every save.
  sign(reset: boolean): (type?: unknown, key?: string, forceReset?: boolean, hooks?: () => unknown[]) => unknown
  // Is told that the page holds the module at an address, and the address it ran from, as each module of development
  // tells it when it runs; and answers whether the page holds one, and whether a module ran from an address already.
  held(address: string, from: string): void
  holds(address: string): boolean
  ran(from: string): boolean
  // Draws again in place each component whose family a module that was taken in place registered anew.
  refreshed(): void
}

declare global {
  // Laid on a page of development by the part `refresh`, and on no other page.
  var __tentRefresh: Refreshing | undefined
}
