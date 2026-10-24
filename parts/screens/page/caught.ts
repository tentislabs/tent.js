import type { Drawable } from '../borrowed/react.ts'
import { Component, ownerStack } from '../borrowed/react.ts'

/**
 * Holds a view. Where drawing it fails in the browser, the failure is taken: `failed` is told what was thrown, and
 * nothing is drawn in the place of the view, so that the page can draw the `error` screen there.
 */
export class Caught extends Component<
  { failed(thrown: unknown, owners: string): void; children?: Drawable },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  // React of development tells, while it tells of the failure, which tags of the files drew what failed.
  override componentDidCatch(thrown: unknown): void {
    this.props.failed(thrown, ownerStack())
  }

  override render(): Drawable {
    return this.state.failed ? null : this.props.children
  }
}
