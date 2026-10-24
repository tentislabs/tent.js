// A helper that imports neither side, between a screen and a backend file.
export { openOrders, markPaid } from '../functions/orders'

export const told = (what: object): string => JSON.stringify(what)
