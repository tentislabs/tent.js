import { advisedOf } from '../advice.ts'
import type { App } from '../app.ts'
import { backOf } from '../backTables.ts'
import { factsIn, factsInFiles, isDescription } from '../facts.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { notTaken } from '../program.ts'
import type { Facts } from '../../core/internal.ts'

/**
 * `app.facts`: what the check needs of the running app. For the description it is handed, and for the one of the
 * running version where it is handed none, it answers what the table change from the data of the app would be
 * refused for. Of an app that keeps a data file for each tenant it answers a promise, and holds the file of each
 * tenant against the description too. With `back` the data is held against the description as a switch back
 * plans by it, the file of each tenant too: a rename is turned round, and what was added since is retired. It reads, and changes nothing.
 */
export const member =
  (o: Opened): App['facts'] =>
  (description, how) => {
    heldOpen(o)
    if (description !== undefined && !isDescription(description)) throw notTaken('facts', 'a description, or nothing')
    const asked = description ?? o.description
    // The files of tenants follow a way back as the shared file does: a rename is turned round in every file.
    const held = how?.back === true ? backOf(o.store, asked, o.description) : asked
    // The index advice the app gave stands with what the data says, as notes of the tables it names.
    const advice = advisedOf(o, asked)
    const withAdvice = (facts: Facts): Facts => ({ ...facts, tableFindings: [...facts.tableFindings, ...advice] })
    return o.files ? factsInFiles(o.files, held).then(withAdvice) : withAdvice(factsIn(o.store, held))
  }
