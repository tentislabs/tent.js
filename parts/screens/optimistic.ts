import { isOptimistic } from './page/worked.ts'

/** Takes a row a view draws. Answers whether it is shown ahead of the answer of the change that made it. */
export function optimistic(row: object): boolean {
  return isOptimistic(row)
}
