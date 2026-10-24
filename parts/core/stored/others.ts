import { isMarked } from '../mark.ts'
import type { Stored } from '../record.ts'
import { limitsOf } from './flow.ts'
import { nameIf } from './named.ts'
import type { Told } from './shared.ts'
import { handedName, known, optionsOf, plainOf, report, required, setField, wasOf } from './shared.ts'
import { ruleOf, typesOf } from './type.ts'

/** The options of `route`, of `incoming` and of `command`. */
const otherOptions: Record<string, string[]> = {
  route: ['method', 'path', 'access', 'run', 'system', 'origins', 'limits', 'was'],
  incoming: ['path', 'then', 'verify', 'open', 'limits', 'was'],
  command: ['about', 'run', 'access', 'args', 'was'],
}

/** Takes the options of `route` as they were written. Answers the record of the route, which is always code. */
export function routeOf(told: Told, o: Stored): Stored {
  known(told, 'route', o, otherOptions.route)
  required(told, 'route', o, ['method', 'path', 'access', 'run'])
  const stored: Stored = {}
  setField(stored, 'method', o.method)
  setField(stored, 'path', o.path)
  setField(stored, 'access', ruleOf(told, 'access', o.access, `${told.name}_access`))
  setField(stored, 'system', o.system)
  setField(stored, 'origins', isMarked(o.origins) ? { ...o.origins } : o.origins)
  setField(stored, 'limits', limitsOf(told, o.limits, ['time'], ['size']))
  stored.export = told.name
  setField(stored, 'was', wasOf(o.was))
  return stored
}

/** Takes the options of `incoming` as they were written. Answers the record of the incoming call as it is stored. */
export function incomingOf(told: Told, o: Stored): Stored {
  known(told, 'incoming', o, otherOptions.incoming)
  required(told, 'incoming', o, ['path', 'then'])
  if (o.verify !== undefined && o.open !== undefined)
    report(told, 'T1007', 'it states both `verify` and `open`.', 'Keep one of the two.')
  const stored: Stored = {}
  setField(stored, 'path', o.path)
  const signature = handedName(o.verify)
  if (signature) {
    const [service] = signature.split('.')
    const webhook = optionsOf(told.all.get(service)?.options.webhook)
    if (webhook.scheme === undefined)
      report(
        told,
        'T1014',
        `\`verify\` names the signature of ${service}, which states no \`webhook\`.`,
        'State `webhook` on the service.',
      )
    stored.verify = plainOf({ scheme: webhook.scheme, service })
  } else setField(stored, 'verify', plainOf(o.verify))
  setField(stored, 'open', o.open)
  setField(stored, 'limits', limitsOf(told, o.limits, [], ['size']))
  setField(stored, 'then', nameIf(told, 'then', o.then))
  setField(stored, 'was', wasOf(o.was))
  return stored
}

/** Takes the options of `command` as they were written. Answers the record of the command, which is always code. */
export function commandOf(told: Told, o: Stored): Stored {
  known(told, 'command', o, otherOptions.command)
  required(told, 'command', o, ['run'])
  const stored: Stored = {}
  setField(stored, 'about', o.about)
  setField(stored, 'args', typesOf(told, 'args', o.args))
  setField(stored, 'access', ruleOf(told, 'access', o.access, `${told.name}_access`))
  stored.export = told.name
  setField(stored, 'was', wasOf(o.was))
  return stored
}
