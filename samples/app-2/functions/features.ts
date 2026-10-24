import { anyone, input, link, number, query } from 'tentjs'
import { features } from '../tables/features'

export const featureList = query('featureList', {
  about: 'The features in the order they were written, as many as are asked for',
  access: anyone('the features are what the site shows every visitor'),
  input: { limit: number({ whole: true, min: 1, max: 50, default: 50 }) },
  rows: features.where({}).oldest('createdAt').limit(input('limit')),
})

export const getFeature = query('getFeature', {
  about: 'One feature, for its own page',
  access: anyone('the features are what the site shows every visitor'),
  input: { id: link('features') },
  rows: features.get(input('id')),
})

export const featureIds = query('featureIds', {
  about: 'The id of every feature, for the sitemap',
  access: anyone('the sitemap lists every feature page'),
  live: false,
  rows: features.where({}).pick(['id']),
})
