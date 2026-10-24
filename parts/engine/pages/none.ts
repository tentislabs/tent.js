import { TentError } from '../../core/index.ts'

/** The error of a request for a screen in an app that holds none: nothing of the screens is loaded for it. */
export const noScreens = (path: string): TentError =>
  new TentError('T0001', `Nothing answers GET ${path.slice(0, 120)}: the app holds no screen.`, {
    fix: 'A call is a `POST` of JSON to `/_t/call/<name>`.',
  })
