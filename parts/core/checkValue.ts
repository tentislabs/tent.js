import { checkInto, missOf } from './checked.ts'
import type { Finding } from './errors.ts'
import { faultOf } from './itself.ts'
import type { Type } from './type.ts'

/**
 * Takes a type and a value. Answers a finding for each field that does not fit, none where the value fits: the
 * `fields` of a finding hold the dotted name of the field, which is empty for the value itself, with the name of the
 * check it failed. A field that the type does not name is refused. A value that holds itself, and one that is
 * nested more than 200 deep, fits no type: the one finding of it names the place. Throws T0009 where a shape names
 * a shape that nothing has kept.
 */
export function checkValue(type: Type, value: unknown): Finding[] {
  // The walk into the value follows this one, which calls nothing inside itself.
  const fault = faultOf(value)
  return fault ? [missOf(fault.at, 'type', fault.words)] : checkInto(type, value)
}
