import type { Description } from './description.ts'
import type { Stored } from './record.ts'
import { isStored } from './record.ts'

/** Whether a stored body reaches something that sends: a call of a service that sends, mail, or a function, a flow or a model that sends. */
function bodySends(description: Description, node: unknown, seen: Set<string>): boolean {
  if (Array.isArray(node)) return node.some((one) => bodySends(description, one, seen))
  if (!isStored(node)) return false
  const call = isStored(node.call) ? node.call : {}
  if (call.builtin === 'mail.send') return true
  if (typeof call.service === 'string' && typeof call.call === 'string')
    return callSends(description, call.service, call.call)
  for (const kind of ['function', 'flow', 'model'])
    if (typeof call[kind] === 'string' && call.member === undefined && sends(description, call[kind], seen)) return true
  // A flow that the body starts and does not wait for, and the flow that `step.many` runs for each entry.
  const args = Array.isArray(node.args) ? node.args : []
  const started = node.fn === 'start' ? args[0] : node.fn === 'step.many' ? args[2] : undefined
  if (isStored(started) && typeof started.flow === 'string' && sends(description, started.flow, seen)) return true
  return Object.values(node).some((one) => bodySends(description, one, seen))
}

/** Whether a call of a service sends data out: every call does, a GET too, unless it states that it does not. */
function callSends(description: Description, service: string, call: string): boolean {
  const calls = description.services[service]?.calls
  const record = isStored(calls) && isStored(calls[call]) ? calls[call] : {}
  return record.sends !== false
}

/** Whether what a definition writes sets off a flow that sends: a flow with a trigger on a table that it touches. */
function setsOff(description: Description, record: Stored, seen: Set<string>): boolean {
  const touches = Array.isArray(record.touches) ? record.touches : []
  return Object.entries(description.flows).some(
    ([name, flow]) =>
      Array.isArray(flow.on) &&
      flow.on.some((trigger) => isStored(trigger) && touches.includes(trigger.table)) &&
      sends(description, name, seen),
  )
}

/** Whether the hold of the project names a way out: a host, a program or a native module the app may reach. */
function holdNamesWayOut(description: Description): boolean {
  const hold = description.project.hold
  if (typeof hold !== 'object' || hold === null) return false
  return ['net', 'programs', 'native'].some((key) => {
    const list = Reflect.get(hold, key)
    return Array.isArray(list) && list.length > 0
  })
}

function sends(description: Description, name: string, seen: Set<string>): boolean {
  if (seen.has(name)) return false
  seen.add(name)
  const fn = description.functions[name]
  const flow = description.flows[name]
  const model = description.models[name]
  if (fn) {
    // With the hold on and a way out named, a code action sends, whatever it states: what the engine knows of the
    // hold wins over `sends: false`, so a model is told the truth about data that may leave.
    const held = fn.kind === 'action' && fn.form === 'code' && holdNamesWayOut(description)
    const own =
      fn.kind === 'action' &&
      (fn.sends !== false || held) &&
      (fn.form === 'code' || bodySends(description, fn.body, seen))
    return own || setsOff(description, fn, seen)
  }
  if (flow) {
    if (flow.agent !== undefined) return false
    return flow.sends !== false && (flow.form === 'code' || bodySends(description, [flow.body, flow.onFail], seen))
  }
  if (model) return isStored(model.call) && callSends(description, String(model.call.service), String(model.call.call))
  // A tool of an outside server is named with the name of its service and a dot.
  const [service, tool] = name.split('.')
  return tool !== undefined && Boolean(description.services[service]?.mcp)
}

/**
 * Takes a description and the name of a tool: a function, a flow, an agent, a model, or a tool of an outside
 * server as `<service>.<tool>`. Answers whether it sends data out, as far as the description shows.
 */
export function sendsOut(description: Description, name: string): boolean {
  return sends(description, name, new Set())
}
