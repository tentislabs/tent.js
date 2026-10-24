import type { FileName, Touched } from './fileName.ts'
import type { By, Store, TableLayout, Tx } from './store.ts'

/**
 * One write of the files of an app. `tx` answers the write of the shared file, or of one tenant's: it opens the
 * write at the first asking, and a second file is T2109. A read goes to the store of its file.
 */
export interface Writing {
  files: Files
  tx(file?: FileName): Tx
}

/**
 * The data files of an app that keeps a file for each tenant: the shared file, and the file of each tenant,
 * each of them a store. `data` owns where a row lives, and the engine owns which files are open.
 */
export interface Files {
  /** The shared file, `data.db`. */
  shared: Store
  /**
   * The file of one tenant, opened where it is closed. With `make` it is made where it is not there, for a
   * write. Nothing where there is none, and for what names no tenant. Throws `NotReady` for a file that
   * `before` holds back.
   */
  of(file: FileName, o?: { make?: boolean }): Store | undefined
  /** One write, of one file: the one that `fn` first writes to. `steps` and `by` are as `Store.write` takes them. */
  write<T>(fn: (w: Writing) => T, o?: { steps?: boolean; by?: By }): { value: T; touched: Touched[]; file?: FileName }
  /** Where the file of that tenant stands, for a thread that opens a store of its own. */
  path(file: FileName): string
  /** The files that are open now. */
  open(): FileName[]
  /** Closes the file of one tenant. */
  close(file: FileName): void
  /** Whether that tenant has a file: asked of the disk, with no opening. */
  has(file: FileName): boolean
  /** Closes the file of one tenant and removes it, with what SQLite keeps beside it. */
  remove(file: FileName): void
  /** Tells the running layout, at a switch. */
  layout(to: TableLayout[]): void
  /** Every file that stands on the disk under `tenants/`. */
  walk(): Iterable<FileName>
}

/** What `openFiles` takes last. */
export interface FilesOptions {
  /** Makes a store: one for the shared file, and one for each file of a tenant that is opened. */
  store: () => Store
  /** Is asked for a file that was just opened, before anything reads it: the engine sweeps it there, or answers `'wait'` for one that is behind. */
  before?: (file: FileName, store: Store) => 'ready' | 'wait'
  /** Is told before the first write of a file since it was opened, and before a file is made. */
  writing?: (file: FileName) => void
  /** Is told of each file that was opened or made. */
  opened?: (file: FileName) => void
}
