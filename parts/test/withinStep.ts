import { TentError } from '../core/index.ts'
import type { Browsed } from '../engine/index.ts'

/**
 * Takes the browser of a page of a test and the longest a step may take, in milliseconds. Answers the same browser,
 * whose every answer is waited for that long at most: a page that holds its browser, as a question of the browser's
 * own that nobody answers does, fails the step with T0008, naming what the browser did not answer.
 */
export function withinStep(browsed: Browsed, step: number): Browsed {
  const bounded =
    <Given extends unknown[], Answer>(what: string, work: (...given: Given) => Promise<Answer>) =>
    (...given: Given): Promise<Answer> => {
      let timer: NodeJS.Timeout | undefined
      const late = new Promise<never>((_, failed) => {
        timer = setTimeout(
          () =>
            failed(
              new TentError('T0008', `The browser did not answer ${what} within ${step / 1000} seconds.`, {
                fix: 'Look at what the page holds that holds its browser: a question of the browser, as `alert` asks, which nobody answers. `limits.testStep` bounds a step.',
              }),
            ),
          step,
        )
      })
      return Promise.race([work(...given), late]).finally(() => clearTimeout(timer))
    }
  return {
    engine: browsed.engine,
    origin: browsed.origin,
    go: bounded('the load of an address', (address: string) => browsed.go(address)),
    evaluate: bounded('a question to the page', (expression: string) => browsed.evaluate(expression)),
    click: bounded('a press', (at: { x: number; y: number }) => browsed.click(at)),
    type: bounded('the typing of a text', (text: string) => browsed.type(text)),
    enter: bounded('the key Enter', () => browsed.enter()),
    files: bounded('the files of a field', (expression: string, paths: string[]) => browsed.files(expression, paths)),
    picture: bounded('a picture', (o?: { full?: boolean }) => browsed.picture(o)),
    console: () => browsed.console(),
    preload: bounded('the script of each document', (text: string) => browsed.preload(text)),
    loaded: () => browsed.loaded(),
    end: () => browsed.end(),
  }
}
