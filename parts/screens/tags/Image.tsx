import type { asset } from '../../core/index.ts'
import type { ImgHTMLAttributes, ReactElement } from '../borrowed/react.ts'
import { createElement } from '../borrowed/react.ts'
import { usePart } from '../page/parts.ts'

/** The properties of `Image`: those of an `<img>` but its sources and its loading, and what says what it shows. */
export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'loading' | 'alt'> {
  // An asset; the id of a file of the app; an address on a host of `project.hosts`.
  src: ReturnType<typeof asset> | string
  // Required: '' for a picture that only decorates.
  alt: string
  // For an asset, taken from its file where left out.
  width?: number
  height?: number
  // As the browser reads it: '100vw' when left out.
  sizes?: string
  // It loads with the page and is named in the head.
  priority?: boolean
}

/**
 * A picture through the image door: one `<img>` in the widths the door answers, which loads when it is near the
 * view, with its tiny copy as its background until it has loaded. It is drawn by the part of the page code that
 * holds pictures, which a page with a picture loads.
 */
export function Image(given: ImageProps): ReactElement {
  const part = usePart('image')
  return part ? createElement(part.Image, { ...given }) : createElement('img', { alt: given.alt })
}
