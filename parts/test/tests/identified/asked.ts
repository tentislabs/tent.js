// How often `identify` was asked, which a test reads through a query.
let count = 0

export const counted = (): void => {
  count += 1
}

export const howOften = (): number => count
