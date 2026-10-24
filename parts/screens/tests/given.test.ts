import assert from 'node:assert/strict'
import { test } from 'node:test'
import type * as types from '../index.ts'
import * as ui from '../index.ts'

// The names that `30`, section 2, lists for `tentjs/ui`, by their groups: what is taken from `core`, the words of
// screens, the tags, the hooks and the helper.
const listed = [
  ...['anyone', 'asset', 'boolean', 'choice', 'date', 'day', 'file', 'given', 'json', 'link', 'list'],
  ...['message', 'number', 'object', 'role', 'text', 'vector'],
  ...['screen', 'component', 'read', 'messages'],
  ...['Link', 'Form', 'Image'],
  ...['useAgent', 'useCall', 'useField', 'useGoTo', 'useMicrophone', 'useNonce', 'useParams', 'useQuery'],
  ...['useRun', 'useSettings', 'useTranslations', 'useUser'],
  'optimistic',
]

// Each type that the section lists, named once: a type that `tentjs/ui` does not give fails the type checker here.
type Listed = [
  types.Access,
  types.AppState,
  types.AgentShown,
  types.CallOptions<unknown, types.Stub>,
  types.CallState,
  types.Called<unknown, unknown>,
  types.ComponentDefinition<never, never>,
  types.ComponentOptions<never, never, never>,
  types.FieldOf,
  types.FormProps<types.Stub>,
  types.Given<never>,
  types.Handed<never>,
  types.HeadLine,
  types.ImageProps,
  types.InputProps,
  types.LanguageFile,
  types.LinkProps,
  types.Microphone,
  types.Queried<unknown>,
  types.Read,
  types.ReadOptions,
  types.RunShown,
  types.ScreenDefinition,
  types.ScreenOptions<never, never, never>,
  types.Translations,
  types.StateEntry,
  types.Stub,
  types.Messages,
  types.Then<unknown>,
  types.Travelled<never>,
  types.Type,
  types.User,
  types.ValueFormat,
  types.ViewHanded<never, never, never>,
  types.WireError,
  types.Message,
  types.MessagesOfFile,
]

test('[30-2] tentjs/ui gives every name that the list of its names holds, given among them, and every type, CallOptions among them', () => {
  const missing = listed.filter((name) => !Object.hasOwn(ui, name) || Reflect.get(ui, name) === undefined)
  assert.deepEqual(missing, [])
  assert.equal(typeof ui.given, 'function')
  // The number of the types that the section lists, held by the type checker against the list above.
  const counted: Listed['length'] = 37
  assert.equal(counted, 37)
})
