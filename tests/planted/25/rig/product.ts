// T2001 is raised here: a label of the product, with four digits, passes.
export const code = 'T2001'
// Of two moments, t1 and t2, the later one is kept: the letters alone, written small, pass.
export const later = (t1: number, t2: number) => Math.max(t1, t2)
