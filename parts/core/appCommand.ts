/**
 * Takes the name of an app and the `cli` part of its project. Answers the name of the app's command: `cli.name`
 * where it gives one, or else the name of the app with a hyphen and a small letter where it has a capital. It is
 * the one rule that the description, the runner and the launcher name the command by.
 */
export function appCommand(app: string, cli: unknown): string {
  const named: unknown = Reflect.get(Object(cli), 'name')
  return typeof named === 'string' ? named : app.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
