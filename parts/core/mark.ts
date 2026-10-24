// Kept beside the record and not on it, so that a marked record is still plain data and is stored as it stands.
const marked = new WeakSet<object>()

/** Takes a record that a word of ours made. Answers it, marked, so that it is told from one the author wrote. */
export function mark<Made extends object>(record: Made): Made {
  marked.add(record)
  return record
}

/** Whether a value is a record that a word of ours made. */
export const isMarked = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && marked.has(value)
