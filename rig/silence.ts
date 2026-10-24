// What a page of a test browser runs before its own scripts, in an engine that has no way of its own to play no
// sound: the sound of a media element, of Web Audio and of a voice goes to nothing, and what the page reads of each
// stays as the page set it.

/** Sends the sound of a page to nothing. It is handed to the browser as text, so it names nothing outside itself. */
export function silenced(): void {
  /** Sets the engine's own value of a property to `quiet`, and has the page read and write a value of its own there. */
  const quietened = (thing: object, property: string, quiet: unknown): void => {
    if (Object.hasOwn(thing, property)) return
    let proto: object | null = Object.getPrototypeOf(thing)
    let held: PropertyDescriptor | undefined
    while (proto && !held) {
      held = Object.getOwnPropertyDescriptor(proto, property)
      proto = Object.getPrototypeOf(proto)
    }
    if (!held?.get || !held.set) return
    let shown: unknown = held.get.call(thing)
    held.set.call(thing, quiet)
    Object.defineProperty(thing, property, {
      configurable: true,
      enumerable: true,
      get: () => shown,
      set: (value: unknown) => {
        shown = value
      },
    })
  }
  // A media element is muted where the engine plays it, while the page reads `muted` as it set it.
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement, ...given: []) {
    quietened(this, 'muted', true)
    return play.apply(this, given)
  }
  // A voice speaks at no volume, while the page reads the volume it gave.
  if (typeof speechSynthesis === 'object' && typeof SpeechSynthesisUtterance === 'function') {
    const speak = speechSynthesis.speak
    speechSynthesis.speak = function (this: SpeechSynthesis, utterance: SpeechSynthesisUtterance) {
      quietened(utterance, 'volume', 0)
      return speak.call(this, utterance)
    }
  }
  // What Web Audio sends to the speakers passes a gain of nothing. A context that renders to memory is left as it is.
  if (typeof AudioContext === 'function') {
    const real = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination')?.get
    const gains = new WeakMap<object, AudioNode>()
    if (real)
      Object.defineProperty(AudioContext.prototype, 'destination', {
        configurable: true,
        get(this: AudioContext) {
          const held = gains.get(this)
          if (held) return held
          const gain = this.createGain()
          gain.gain.value = 0
          gain.connect(real.call(this))
          gains.set(this, gain)
          return gain
        },
      })
  }
}
