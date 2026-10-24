import type { Drawable } from '../../borrowed/react.ts'
import { createElement, useState } from '../../borrowed/react.ts'
import type { ImageProps } from '../../tags/Image.tsx'
import { useStore } from '../context.ts'
import { loadedOf, pictureKey, sourceOf } from './sources.ts'
import { holdPart } from '../parts.ts'

/**
 * The page code of `Image`: an asset, a file of the app or an address on a listed host. A picture of the app is
 * asked for in the widths of the image door, and its tiny copy stands as its background until it has loaded. A
 * source that may not be loaded draws the picture with no address; an asset that no file has draws nothing. An
 * asset whose size the view leaves out takes the size of its file.
 */
export function ImageDrawn(given: ImageProps): Drawable {
  const { src, alt, width, height, sizes, priority, style, onLoad, ...rest } = given
  const store = useStore()
  const [shown, setShown] = useState(false)
  const source = sourceOf(src)
  const loaded = loadedOf(source, store, true)
  if (source && 'asset' in source && !loaded) return null
  const sized = source && 'asset' in source ? store.sizeOf?.(source.asset) : undefined
  const asked = typeof sizes === 'string' ? sizes : '100vw'
  const ahead =
    priority && loaded
      ? { src: loaded.src, ...(loaded.srcSet ? { srcSet: loaded.srcSet, sizes: asked } : {}) }
      : undefined
  const told =
    loaded?.picture && loaded.widths
      ? (store.pictureMet?.(loaded.picture, loaded.widths, ahead) ?? store.page.pictures?.[pictureKey(loaded.picture)])
      : undefined
  const tiny = !shown && typeof told?.tiny === 'string' && told.tiny.startsWith('data:image/') ? told.tiny : undefined
  const drawnWith = { ...style, ...(tiny ? { backgroundImage: `url("${tiny}")` } : {}) }
  const img = createElement('img', {
    ...rest,
    ...(Object.keys(drawnWith).length ? { style: drawnWith } : {}),
    alt,
    ...((width ?? sized?.width) ? { width: width ?? sized?.width } : {}),
    ...((height ?? sized?.height) ? { height: height ?? sized?.height } : {}),
    ...(loaded ? { src: loaded.src } : {}),
    ...(loaded?.srcSet ? { srcSet: loaded.srcSet, sizes: asked } : {}),
    loading: priority ? 'eager' : 'lazy',
    decoding: 'async',
    ...(priority ? { fetchPriority: 'high' } : {}),
    // A picture that loaded before the page came alive has been told so before anyone listened.
    ref: (element: HTMLImageElement | null) => {
      if (element?.complete && element.naturalWidth > 0 && tiny) setShown(true)
    },
    onLoad: (event: Parameters<NonNullable<ImageProps['onLoad']>>[0]) => {
      setShown(true)
      onLoad?.(event)
    },
  })
  // An exported picture written in other formats is one picture element, so that the browser picks the one it takes.
  return loaded?.sources
    ? createElement(
        'picture',
        { style: { display: 'contents' } },
        ...loaded.sources.map((one) =>
          createElement('source', { key: one.type, type: one.type, srcSet: one.srcSet, sizes: asked }),
        ),
        img,
      )
    : img
}

holdPart('image', { Image: ImageDrawn })
