import { TentError } from '../errors.ts'
import type { Only, VectorOptions } from '../type.ts'

/**
 * Takes the options of a vector, of which `size` is required. Answers the record of the type, in which the model
 * stands by its name.
 */
export function vector<const O extends VectorOptions>(
  o: Only<O, VectorOptions>,
): { kind: 'vector'; model?: string } & Omit<O, 'model'> {
  if (typeof o !== 'object' || o === null)
    throw new TentError('T1014', 'vector takes its options as a record, of which `size` is required.')
  const { model, ...rest } = o
  return model ? { kind: 'vector', ...rest, model: model.definition } : { kind: 'vector', ...rest }
}
