# `importFile`

Imports a file that a person uploaded, each record through a change, so an app offers import to its own users.

## Example

```ts
import { action, file, importFile, number, object, role, text } from 'tentjs'
import { addMember } from './members'

export const importMembers = action('importMembers', {
  access: role('staff'),
  input: { members: file() },
  output: object({ run: text() }),
  run: async ({ input }) => importFile(input.members, { with: addMember, map: { 'Full name': 'name' } }),
})
```

## Members

| Member | Does |
|---|---|
| `importFile(file, { with, map, language, dry })` | Imports the file of that id, which the caller may download, handing each record to the change `with` as its input. `map` names a field of the input for a field of the file, as `{ 'Full name': 'name' }`; left out, a field is matched by its name, in any case. `language` is the language its values are written in, as `'de'`, and left out the first language of the project. `dry: true` checks every record and writes nothing. It is a run of the kind `import`, of a flow the engine makes, with the rights of the caller, which a page follows as any run (`hook.useRun`), and it answers a promise of `{ run }` once the run is added. The run is one step, `import`, tried once, and answers `{ records, imported, refused, refusedFile }`: `refusedFile` is the id of a loose file of the caller, a CSV that lists each refused record with its line, the field that does not fit and why, where a record was refused. An action whose `run` names `importFile` makes its app keep runs |

The change is called as the caller of the call, so every row passes the change's types, its rules and its triggers. The forms that are read, the reading of values, the pages and the place are those of `command.data`, `import`: the same file imported again by the same change goes on from where an import of it stopped.

**Where it works.** In an action and in a route, where a call may wait.

## Errors

`code.T0001` for a file that is not there or not the caller's to download, and for `with` that is no change. `code.T0002` for a file of a form that no import reads, or that does not read as its form. `code.T0013` where no call is under way, and in a query or a change.

## See also

`command.data`, `handle.files`
