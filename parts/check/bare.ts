import { isStored } from '../core/internal.ts'

/** Takes a stored rule. Answers whether it is bare `'anyone'`: open to anyone, with no reason, or one of spaces alone. */
export const isBare = (rule: unknown): boolean =>
  isStored(rule) && rule.rule === 'anyone' && (typeof rule.why !== 'string' || rule.why.trim() === '')
