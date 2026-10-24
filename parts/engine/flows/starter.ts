import type { Caller } from '../../core/index.ts'
import type { By } from '../../flows/index.ts'
import { visit } from '../visit.ts'
import { visitorOf } from '../visitor.ts'
import { byOfCaller } from './words.ts'

/**
 * Who starts a run: the caller, and for a visitor with no visitor id where a browser is being answered, a new id
 * that the answer sets in its cookie, so that the visitor may follow and answer their own run.
 */
export function starterOf(caller: Caller): By {
  const here = visit()
  if (caller.kind !== 'nobody' || caller.visitor !== undefined || !here || here.answered) return byOfCaller(caller)
  return { kind: 'visitor', id: visitorOf(here), fresh: true }
}
