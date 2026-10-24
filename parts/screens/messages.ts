/** The messages of a language file: a text, which may hold places in curly brackets, a record of plural forms, or messages nested under a name. */
export interface MessagesOfFile {
  [key: string]: string | MessagesOfFile
}

/** What a language file exports as its default: its language, and its messages. */
export interface LanguageFile {
  language: string
  messages: MessagesOfFile
}

/**
 * Takes the code of a language and its messages. Answers what a language file exports as its default, which the
 * build finds wherever the file lies, and reads as it is written.
 */
export function messages(language: string, messages: MessagesOfFile): LanguageFile {
  return Object.freeze({ language, messages })
}
