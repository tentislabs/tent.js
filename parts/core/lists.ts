// The lists of a project's definitions. They are declared with no definition in them, and the type list that the
// build writes into a project adds one line for each, so that `db.orders` and a setting are typed.

/** The tables of the project, each as its definition. */
export interface Tables {}

/** The queries, changes and actions of the project. */
export interface Functions {}

/** The flows and agents of the project. */
export interface Flows {}

/** The services of the project, each with the calls that the build read from a published description. */
export interface Services {}

/** The models of the project. */
export interface Models {}

/** The settings of the project, each as the type of its value. */
export interface Settings {}

/** The events that the definition files declare, each as the type of its data, by its name. */
export interface Events {}
