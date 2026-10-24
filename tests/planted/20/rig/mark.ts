const mark: unique symbol = Symbol('mark')

export const marked = (): { [mark]: number } => ({ [mark]: 1 })
