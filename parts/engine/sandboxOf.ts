import type { App } from './app.ts'
import { openedOf } from './app.ts'
import type { Sandbox } from './makers.ts'

/** The closed room that the makers of an app made, for a program that builds and runs code of others beside it, or nothing. */
export const sandboxOf = (app: App): Sandbox | undefined => openedOf(app)?.sandbox
