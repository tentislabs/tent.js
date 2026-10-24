import type { PlanRecord } from './plan.ts'

// A plan carries members of the same names as the fields of its record, so the record is kept beside it.
const plans = new WeakMap<object, PlanRecord>()

/** Takes a plan and its stored record, and keeps the record for it. Answers the plan. */
export function keepPlan<Made extends object>(plan: Made, record: PlanRecord): Made {
  plans.set(plan, record)
  return plan
}

/** Answers the stored record of a plan that a table made, or nothing for any other value. */
export const planOf = (value: unknown): PlanRecord | undefined =>
  typeof value === 'object' && value !== null ? plans.get(value) : undefined
