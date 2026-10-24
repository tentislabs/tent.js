import { TentError } from '../core/index.ts'

/** What every address of the link answers a request that it does not serve: nothing of the app is told. */
export const noLink = (): TentError =>
  new TentError('T0001', 'Nothing answers this request.', {
    fix: 'An address of the link is asked by a reader, with its key, over a secure connection.',
  })
