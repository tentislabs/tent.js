import type { CallContext } from './context.ts'

/**
 * Whether the code of a call has full access: its caller is the system, or the function or the route it belongs
 * to states `system`.
 */
export function hasFullAccess(cx: CallContext): boolean {
  if (cx.caller.kind === 'system') return true
  const { functions } = cx.app.description
  const record = Object.hasOwn(functions, cx.work.name) ? functions[cx.work.name] : undefined
  if (typeof record?.system === 'string') return true
  // A route works under its own name, which no function has.
  const { routes } = cx.app.description
  return !record && Object.hasOwn(routes, cx.work.name) && typeof routes[cx.work.name].system === 'string'
}
