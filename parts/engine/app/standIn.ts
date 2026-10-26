import { TentError } from '../../core/index.ts'
import type { App } from '../app.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { keepStandIn } from '../services/standIns.ts'

/**
 * `app.standIn`: puts a stand-in in place of a service or a model, by its name. For a service it is an object of
 * its calls, each an answer or a function of the input that gives one, which is asked in place of sending: the
 * input and the sign-in are still checked, and the answer is read against the output. Under the name `fetch`, its
 * member `fetch` answers every plain `fetch` of the app's code in place of sending it. Throws T0013 for a name that
 * is no service, no model of the app and not `fetch`, and for a stand-in that is no object.
 */
export const member =
  (o: Opened): App['standIn'] =>
  (name, stand) => {
    heldOpen(o)
    const known =
      name === 'fetch' || Object.hasOwn(o.description.services, name) || Object.hasOwn(o.description.models, name)
    if (!known || typeof stand !== 'object' || stand === null)
      throw new TentError(
        'T0013',
        `${JSON.stringify(name).slice(0, 80)} names no service and no model of the app ${o.name}.`,
        {
          fix: 'Hand `app.standIn` the name of a service or a model, and an object of its calls.',
        },
      )
    keepStandIn(o, name, stand)
  }
