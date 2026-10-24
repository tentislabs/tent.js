// The one place of this part that imports React for a view and a tag: every other file takes it from here.
import type { ReactNode } from 'react'
import * as react from 'react'

export {
  Children,
  cloneElement,
  Component,
  createContext,
  createElement,
  Fragment,
  isValidElement,
  use,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
export type {
  AnchorHTMLAttributes,
  CSSProperties,
  FocusEvent,
  FormEvent,
  FormHTMLAttributes,
  ImgHTMLAttributes,
  MouseEvent,
  PointerEvent,
  ReactElement,
  Ref,
} from 'react'

/**
 * The places of the tags that drew what failed, from the innermost out, as React of development tells them while it
 * tells of a failure: what a component of a package that failed was used by, in the file that used it. Empty with
 * React that is made small, which keeps none.
 */
export function ownerStack(): string {
  if (process.env.NODE_ENV === 'production') return ''
  const capture: unknown = Reflect.get(react, 'captureOwnerStack')
  return typeof capture === 'function' ? String(Reflect.apply(capture, undefined, []) ?? '') : ''
}

/** What a view answers: what React can draw. */
export type Drawable = ReactNode
