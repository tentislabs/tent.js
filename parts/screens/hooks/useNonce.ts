import { useStore } from '../page/context.ts'

/**
 * Answers the nonce of the page: the content policy lets in a style tag that carries it, so a library that writes
 * style tags while it draws is handed it, as Emotion's `createCache({ key, nonce })` and Mantine's `getStyleNonce`
 * take it. The same on the server as it draws and in the browser for as long as the page lives; empty where the
 * page was sent with none, as an exported one.
 */
export function useNonce(): string {
  return useStore().page.nonce ?? ''
}
