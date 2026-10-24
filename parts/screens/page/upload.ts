import { isStored } from '../../core/internal.ts'

/** The longest side of a picture that is sent: a larger one is scaled down in the browser first. */
const longest = 2560

/** The kinds of picture that stay what they are when they are scaled down: any other becomes a JPEG. */
const kept = ['image/png', 'image/webp']

/** The kinds that are no picture to scale: drawn by lines, or moving. */
const asTheyAre = ['image/svg+xml', 'image/gif']

// The work of the uploads of the page that is under way, scaling down and sending, and who is told when it changes.
const sending = { count: 0, heard: new Set<() => void>() }

/** Holds a piece of the work of an upload as under way until it ends, and answers what it answers. */
function underWay<Answer>(work: () => Promise<Answer>): Promise<Answer> {
  const told = (by: number): void => {
    sending.count += by
    for (const one of [...sending.heard]) one()
  }
  told(1)
  return work().finally(() => told(-1))
}

/**
 * What the record of a page in the mode `test` reads of the uploads, so that a step waits for one it set off: how
 * much of their work is under way, and what is told each time that changes, with what stops telling it.
 */
export const uploads = {
  under: (): number => sending.count,
  listen(heard: () => void): () => void {
    sending.heard.add(heard)
    return () => void sending.heard.delete(heard)
  },
}

/**
 * Takes a file that a person picked, and whether it is sent as it is. Answers what is sent: a picture larger than
 * the longest side scaled down to it, a PNG and a WebP in their own kind and any other as a JPEG at a quality of
 * 85. Where the browser cannot read the picture or cannot write that kind, the file is sent as it is.
 */
export const scaledDown = (file: File, original: boolean): Promise<Blob> => underWay(() => scaled(file, original))

/** Scales a picture down as `scaledDown` says. */
async function scaled(file: File, original: boolean): Promise<Blob> {
  if (original || !file.type.startsWith('image/') || asTheyAre.includes(file.type)) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  try {
    const picture = await createImageBitmap(file)
    const side = Math.max(picture.width, picture.height)
    if (side <= longest) {
      picture.close()
      return file
    }
    const share = longest / side
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(picture.width * share)
    canvas.height = Math.round(picture.height * share)
    canvas.getContext('2d')?.drawImage(picture, 0, 0, canvas.width, canvas.height)
    picture.close()
    const kind = kept.includes(file.type) ? file.type : 'image/jpeg'
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, kind, 0.85))
    // A browser that cannot write the kind writes another: the picture is then sent as it is.
    return blob && blob.type === kind ? blob : file
  } catch {
    return file
  }
}

/** The name a scaled picture is sent with: a JPEG made of another kind ends as one. */
export function sentName(file: File, sent: Blob): string {
  if (sent === file || sent.type === file.type) return file.name
  const dot = file.name.lastIndexOf('.')
  return `${dot > 0 ? file.name.slice(0, dot) : file.name}.jpg`
}

/** What the files door answered for an upload: the file's id, or the error it was refused with. */
export type Uploaded = { id: string } | { error: { code?: string; message: string; fields?: Record<string, string> } }

/**
 * Sends one file to the files door, at `address`, and tells `step` how far it is, as a share from 0 to 1. Answers
 * the id of the stored file, or the error that the door refused it with. A frame of a chat app sends its pass in
 * the place of a cookie.
 */
export function uploaded(address: string, file: Blob, step: (share: number) => void, pass?: string): Promise<Uploaded> {
  return underWay(() => sent(address, file, step, pass))
}

/** Sends one file to the files door as `uploaded` says. */
function sent(address: string, file: Blob, step: (share: number) => void, pass?: string): Promise<Uploaded> {
  return new Promise((done) => {
    const asking = new XMLHttpRequest()
    asking.open('POST', address)
    asking.withCredentials = pass === undefined
    if (pass !== undefined) asking.setRequestHeader('authorization', `Bearer ${pass}`)
    if (file.type) asking.setRequestHeader('content-type', file.type)
    asking.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) step(event.loaded / event.total)
    }
    const failed = (message: string): void => done({ error: { message } })
    // An upload whose connection stalls or is ended answers too: a file has an hour, however slow the network.
    asking.timeout = 60 * 60 * 1000
    asking.onerror = () => failed('The file could not be sent.')
    asking.onabort = () => failed('The file could not be sent.')
    asking.ontimeout = () => failed('The file could not be sent in time.')
    asking.onload = () => {
      let wire: unknown
      try {
        wire = JSON.parse(asking.responseText)
      } catch {
        return failed('The engine did not answer in the wire form.')
      }
      if (isStored(wire) && wire.ok === true && isStored(wire.value) && typeof wire.value.id === 'string')
        return done({ id: wire.value.id })
      const error = isStored(wire) && isStored(wire.error) ? wire.error : {}
      done({
        error: {
          ...(typeof error.code === 'string' ? { code: error.code } : {}),
          message: typeof error.message === 'string' ? error.message : 'The file was not taken.',
          ...(isStored(error.fields) ? { fields: Object(error.fields) } : {}),
        },
      })
    }
    asking.send(file)
  })
}
