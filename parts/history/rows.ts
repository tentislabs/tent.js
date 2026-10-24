import type { SqliteFile } from '../data/index.ts'
import type { Clash, Kind, Point, Writer } from './point.ts'

const columns = 'id, parents, at, by, kind, name, checked, unsettled, description, files, note, clashes'

/** The kinds of a point. */
export const kinds: readonly Kind[] = ['save', 'command', 'named', 'published', 'back', 'merge', 'turn']

/** What a column holds as JSON, read: a list for the parents and the clashes, a record for the writer and the files. */
const read = <T>(text: unknown): T | undefined => (typeof text === 'string' ? JSON.parse(text) : undefined)

/** A row of `points` as a point. A field that the row does not hold is not set. */
function pointOf(row: object): Point {
  const of = (name: string): unknown => Reflect.get(row, name)
  const [name, description, note, checked] = [of('name'), of('description'), of('note'), of('checked')]
  const files = read<Record<string, string>>(of('files'))
  const clashes = read<Clash[]>(of('clashes'))
  return {
    id: String(of('id')),
    parents: read<string[]>(of('parents')) ?? [],
    at: Number(of('at')),
    by: read<Writer>(of('by')) ?? { kind: 'tool' },
    kind: kinds.find((kind) => kind === of('kind')) ?? 'save',
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof checked === 'number' ? { checked: checked === 1 } : {}),
    ...(of('unsettled') === 1 ? { unsettled: true as const } : {}),
    ...(typeof description === 'string' ? { description } : {}),
    ...(files ? { files } : {}),
    ...(typeof note === 'string' ? { note } : {}),
    ...(clashes ? { clashes } : {}),
  }
}

/** The point of an id, or nothing where the history holds none. */
export function readPoint(file: SqliteFile, id: string): Point | undefined {
  const [row] = file.all(`SELECT ${columns} FROM points WHERE id = ?`, [id])
  return row ? pointOf(row) : undefined
}

/** The points that a statement finds, which names what stands after `FROM points`. */
export const pointsWhere = (file: SqliteFile, rest: string, values: unknown[]): Point[] =>
  file.all(`SELECT ${columns} FROM points ${rest}`, values).map(pointOf)

/** Writes a point as a row. One of its id that stands there is replaced. */
export function keepPoint(file: SqliteFile, point: Point): void {
  file.run(`INSERT OR REPLACE INTO points (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    point.id,
    JSON.stringify(point.parents),
    point.at,
    JSON.stringify(point.by),
    point.kind,
    point.name,
    point.checked,
    point.unsettled,
    point.description,
    point.files ? JSON.stringify(point.files) : undefined,
    point.note,
    point.clashes ? JSON.stringify(point.clashes) : undefined,
  ])
}

/** Whether the history holds a point of an id. */
export const hasPoint = (file: SqliteFile, id: string): boolean =>
  file.all('SELECT 1 FROM points WHERE id = ?', [id]).length > 0
