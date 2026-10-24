// The reader of PNG files has its one home in the part of the test helpers, which a rig may import and a part not a rig.
export type { Picture } from '../parts/test/png.ts'
export { differing, readPng } from '../parts/test/png.ts'
