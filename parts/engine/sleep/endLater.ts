/** An end of a connection: what it sends, who listens to what arrives, and its closing. */
interface End<Sent, Got> {
  send(message: Sent): void
  each(fn: (message: Got) => void, closed?: () => void): void
  close(): void
}

/**
 * Takes the end of a connection that is opened once an app that sleeps has woken. Answers an end at once: what is
 * sent through it waits for the waking, and who listens is handed to the end that is opened. Where the waking
 * fails, the end is closed.
 */
export function endLater<Sent, Got>(coming: Promise<End<Sent, Got>>): End<Sent, Got> {
  let end: End<Sent, Got> | undefined
  let over = false
  let listener: [(message: Got) => void, (() => void) | undefined] | undefined
  const before: Sent[] = []
  const shut = (): void => {
    if (over) return
    over = true
    listener?.[1]?.()
  }
  coming.then((made) => {
    if (over) return made.close()
    end = made
    for (const message of before.splice(0)) made.send(message)
    if (listener) made.each(listener[0], listener[1])
  }, shut)
  return {
    send(message) {
      if (end) end.send(message)
      else if (!over) before.push(message)
    },
    each(fn, closed) {
      listener = [fn, closed]
      if (end) end.each(fn, closed)
      else if (over) closed?.()
    },
    close() {
      if (end) end.close()
      else shut()
    },
  }
}
