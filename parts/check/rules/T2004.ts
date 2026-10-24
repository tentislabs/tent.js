import { passedOn } from '../passed.ts'
import type { Rule } from '../rule.ts'

/** A name that is gone from the data of a running app while another is new, with no `was`: passed on from its facts, under `T2004`. */
export const rule: Rule = passedOn('T2004')
