/**
 * Takes one line of a file that holds a record on each line. Answers the record, or none where the line is no
 * record: a write that a stop cut off leaves a last line that is half written, and it is passed over.
 */
export function readLine(line: string): object[] {
  try {
    const read: unknown = JSON.parse(line)
    return typeof read === 'object' && read !== null && !Array.isArray(read) ? [read] : []
  } catch {
    return []
  }
}
