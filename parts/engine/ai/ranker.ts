import { TentError } from '../../core/index.ts'
import type { Ranker } from '../../data/index.ts'
import { underWay } from '../context.ts'

/**
 * What `data` is handed to rank rows by: the call `rank` of the model, made in the call that reads, as its caller,
 * through the model layer, so it is counted, limited and logged as every model call is. The model layer is loaded
 * at the first rank. Answers one score for each text.
 */
export const ranker: Ranker = async (model, words, texts) => {
  const cx = underWay()
  if (!cx) throw new TentError('T0013', `The model ${model} was asked to rank with no call under way.`)
  const { callModel } = await import('./call.ts')
  const scores: unknown = await callModel(cx, `${model}.rank`, [words, texts])
  return Array.isArray(scores) ? scores.map(Number) : []
}
