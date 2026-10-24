import type { LiveSocket, SocketOn } from './live.ts'
import type { Words } from './spoken.ts'
import type { ViewRecord } from './types.ts'
import type { Blocked } from './unlock.ts'

/** What a living page reaches the engine and the browser through. */
export interface Reach {
  // Sends a body as JSON to an address of the app, with the headers it is handed, and answers what came back, read
  // as JSON.
  post(address: string, body: unknown, headers?: Record<string, string>): Promise<unknown>
  // Loads an address as a whole page.
  go(address: string, replace?: boolean): void
  // Carries a piece of work out again and again, each time after so many milliseconds, and answers what stops it.
  every?(work: () => void, ms: number): () => void
  // Loads a part of the page code by its name, and answers when the page holds it.
  part?(name: string): Promise<unknown>
  // Asks an address of the app, and answers what came back, read as JSON.
  get?(address: string): Promise<unknown>
  // Opens a WebSocket to an address of the app. Left out, no live connection can be opened.
  socket?(address: string, on: SocketOn): LiveSocket
  // "keep" where every address of a screen ends in a slash, as the head of the page tells it.
  slash?: string
  // Carries a piece of work out once, after so many milliseconds, and answers what takes it back.
  wait?(work: () => void, ms: number): () => void
  // Marks the screen that is shown as busy for a screen reader, or no longer, while a slow move goes on.
  busy?(on: boolean): void
  // A number from 0 up to 1, drawn at random.
  random?(): number
  // Loads the modules of a screen and of its parts, by their files, and answers the record of each.
  load?(files: string[]): Promise<ViewRecord[]>
  // Loads the file of the messages of the page's language, and answers its words.
  messages?(file: string): Promise<Words>
  // The address that the page shows now: its path, with what stands after the question mark.
  shows?(): string
  // Writes what stands after the question mark of the address, in the place of the address that is shown, or with
  // `step` as one more step of the browser's history.
  address?(written: string, step: boolean): void
  // Shows another address of the app with no load of the document: as one more step of the browser's history,
  // or in the place of the address that is shown.
  moved?(address: string, step: boolean): void
  // Is told that the page shows what a move asked for: the page goes to its top and the focus to its heading,
  // or to the element of a place, and with `keep`, and after a step back, the page stays where it is.
  arrived?(how: { place?: string; keep?: boolean; back?: boolean }): void
  // The time now, in milliseconds.
  now?(): number
  // Is told each time the browser says it is online again.
  online?(heard: () => void): void
  // Is handed what says whether the page holds calls, so that the browser warns before a page that does is closed.
  leaving?(holds: () => boolean): void
  // Carries work out once the browser is idle: none of it stands between a pointer and a press.
  idle?(work: () => void): void
  // Whether the connection of the browser says that it saves data: then nothing is fetched ahead of a move.
  saving?(): boolean
  // Takes the browser one step back in its history, as its own back button does.
  goBack?(): void
  // Names what is told when the browser shows another step of its history.
  back?(heard: () => void): void
  // The name of the app, where the page was told it: a browser keeps the states of an app under it.
  app?: string
  // The cookies of this site that a page may read and write: a value that is empty takes the cookie away.
  cookie?: { get(name: string): string | undefined; set(name: string, value: string): void }
  // The browser's own store for this site.
  kept?: { get(key: string): string | undefined; set(key: string, value: string): void }
  // Adds the style files of another screen or version, and answers once they stand with what takes away those the
  // page held before, which is called once nothing they style is shown.
  styles?(files: string[]): Promise<() => void>
  // In the mode `development`: shows what is wrong as an overlay over the page, and takes it away where nothing is.
  overlay?(shown: Overlay): void
  // In the mode `development`: names what is told each thing that the content policy of the page blocked.
  blocked?(heard: (one: Blocked) => void): void
  // In the mode `development`: takes in place each module that the page holds of those a swap names, at its mark,
  // and has React's Fast Refresh draw again what they changed. Answers false where the page cannot, as one with no
  // runtime of Fast Refresh.
  swap?(modules: Swapped[]): Promise<boolean>
  // In the mode `development`: shows the quiet mark that what the views keep stayed through a save, with what resets
  // the screen that is shown; with nothing, takes the mark away.
  marked?(reset: (() => void) | undefined): void
  // The latest write that the page has seen, in an answer or in a live message, on an app of many machines.
  seen?(): string | undefined
  // Is told the write that a live message stands at.
  saw?(at: string): void
}

/** A module that a swap of development names: its address in the bundle, and its mark. */
export interface Swapped {
  address: string
  mark: string
}

/** What the overlay of a page in development shows: what the build and the check found, and what the content policy blocked. */
export interface Overlay {
  findings: unknown[]
  // Each with the entry of `unlock` that would open it.
  blocked: (Blocked & { unlock: string })[]
}
