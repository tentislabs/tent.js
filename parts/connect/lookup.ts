import { lookup } from 'node:dns/promises'

/** What looks a name up: it is handed a name, and answers every address that the name has. */
export type Lookup = (name: string) => Promise<string[]>

/** The look-up of the system, which answers a name as it answers every program of this computer. */
export const systemLookup: Lookup = async (name) => (await lookup(name, { all: true })).map((one) => one.address)
