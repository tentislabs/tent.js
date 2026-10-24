import { linkPair } from '../copy/link.ts'
import { answerCall } from './answers.ts'
import { takeWorker } from './taken.ts'

/**
 * What the hub needs of the link between machines, loaded only by an app that lets workers join: what opens the
 * two ends of a link with no network, what takes a worker on its end, and what carries out a call that it makes.
 */
export const linking = { linkPair, takeWorker, answerCall }

/** The shape of what the hub is handed of the link. */
export type Linking = typeof linking
