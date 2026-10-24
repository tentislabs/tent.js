import { passedOn } from '../passed.ts'
import type { Rule } from '../rule.ts'

/** A table that the data of a running app holds and the project no longer states: passed on from its facts, under `T2003`. */
export const rule: Rule = passedOn('T2003')
