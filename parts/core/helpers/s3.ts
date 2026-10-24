import { mark } from '../mark.ts'
import type { Secret } from './references.ts'

/** A text that a project states as it is, or by the name of a setting or of a secret. */
type Stated = string | Secret | { setting: string }

/** What `s3` takes: where the store answers, its bucket, the key it is signed with, and its region. */
export interface S3Options {
  url: Stated
  bucket: string
  key: Secret
  region?: string
}

/** The store of files that `s3` names, as the project holds it. */
export interface FileStoreWord {
  s3: S3Options
}

/**
 * Takes where a store of the S3 protocol answers, its bucket, the secret that holds its key as
 * `<the id of the key>:<its secret>`, and its region, `us-east-1` where none is given. Answers the record that
 * names the store, which the engine makes the store of when it is first used: bytes are kept there under their
 * fingerprint, as in every store of files.
 */
export function s3(o: S3Options): FileStoreWord {
  return mark({ s3: mark({ ...o }) })
}
