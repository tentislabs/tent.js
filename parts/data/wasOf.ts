/** Takes a table or the type of a column, as a description or a layout states it. Answers the names it says it had before. */
export const wasOf = (stated: object): string[] =>
  'was' in stated && Array.isArray(stated.was) ? stated.was.map(String) : []
