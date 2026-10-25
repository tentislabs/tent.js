// The faces a bot may wear, shared by its table and the screens that draw them.
export const botShapes = [
  'round',
  'cloud',
  'square',
  'star',
  'flower',
  'drop',
  'triangle',
  'heart',
  'hexagon',
  'diamond',
  'leaf',
  'ghost',
  'pill',
] as const

export const botColours = [
  'white',
  'brown',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'grey',
] as const

export type BotShape = (typeof botShapes)[number]
export type BotColour = (typeof botColours)[number]
