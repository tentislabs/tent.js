import { passedOn } from '../passed.ts'
import type { Rule } from '../rule.ts'

/** A table change that the rows of a running app do not fit: passed on from its facts, under `T2001`. */
export const rule: Rule = passedOn('T2001')
