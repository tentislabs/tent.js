import { member } from '../handle.ts'

/** How a file is imported: the change each record goes to, the names it maps, its language, and whether it writes. */
interface ImportOptions {
  with: { definition: string }
  map?: Record<string, string>
  language?: string
  dry?: boolean
}

/** What the run of an import answers: its counts, and the file that lists the records it refused, where it refused one. */
export interface ImportAnswer {
  records: number
  imported: number
  refused: number
  refusedFile?: string
  dry?: true
}

/**
 * `importFile(file, { with })`: imports a file that the caller may download, each record through the change, in a
 * run of the kind `import`, which a page follows. Answers the run.
 */
type ImportFile = (file: string, o: ImportOptions) => Promise<{ run: string }>

export const importFile: ImportFile = member('importFile', 'file')
