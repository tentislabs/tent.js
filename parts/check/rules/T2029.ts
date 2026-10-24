import { passedOn } from '../passed.ts'
import type { Rule } from '../rule.ts'

/** Index advice that a running app gave, or that its log holds: passed on from its facts, under `T2029`. */
export const rule: Rule = passedOn('T2029')
