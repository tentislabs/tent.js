/** Writes a name as SQLite reads one, whatever letters it holds. */
export const q = (name: string): string => `"${name.replaceAll('"', '""')}"`

/** Writes a text as SQLite reads one. */
export const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`
