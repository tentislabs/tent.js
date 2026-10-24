# `python`

A function whose code is a Python file of the project. It is a helper word: it is stored as an action, and is always code.

## Example

```ts
export const churn = python('churn', {
  file: 'ml/churn.py',
  input: { team: link('teams') },
  output: object({ risk: number() }),
  access: role('staff'),
})
```

The file holds one `run`, which is handed the checked input as plain values and `tent`, and answers the output:

```python
# ml/churn.py
def run(input, tent):
    orders = tent.db().execute("select total from orders").fetchall()   # the rows of `rows`
    return {"risk": 0.2}
```

`tent` gives `db()`, `call(name, input)`, `file(id)`, `folder` (a folder of the call, for files it writes and answers), `disk` (a folder that outlasts calls and restarts), `save_progress(value)` and `progress()` inside a step, `stopping()`, `say(value)`, `log(message)`, and `Fail`, `Error` and `Back`. A `print` is a line of the log. Python runs in a program of its own beside the engine, in an environment made from the project's lock: run `tent python lock` after each change of `packages`. The program loads the file at its first call and keeps it loaded, and is ended when it stood idle for `limits.pythonStopAfter`; a new version runs in a new one.

## Options

| Option | Means |
|---|---|
| `option.python.file` | The Python file that holds the code. |
| `option.python.input` | The fields that a call gives. |
| `option.python.output` | The type of the answer. |
| `option.python.access` | Who may call it. |
| `option.python.packages` | The packages the code needs. |
| `option.python.files` | More files of the project that the code works with. |
| `option.python.lock` | A lock of its own, for packages that cannot share the lock of the project. |
| `option.python.rows` | Plans whose rows reach Python as tables. |
| `option.python.uses` | The functions and the service calls that the Python code may call back. |
| `option.python.limits` | The limits of a call. |
| `option.python.gpu` | Lets the Python program see the graphics cards of the computer. |
| `option.python.atOnce` | How many calls one loaded copy is handed at the same time. |
| `option.python.worker` | The kind of worker it runs on. |
| `option.python.background` | Runs it off the main thread. |
| `option.python.batch` | Gathers calls into one. |
| `option.python.remember` | Keeps the answers for the same input. |
| `option.python.sends` | Whether it sends data out. |
| `option.python.changes` | The builder's word on whether it changes anything. |
| `option.python.callerGone` | What becomes of the work when its caller is gone. |
| `option.python.follow` | Who may follow its runs from a page. |
| `option.python.countBy` | For whom its calls are counted. |
| `option.python.about` | One sentence on what it is for. |
| `option.python.danger` | Whether AIs and MCP callers ask a person before it runs. |
| `option.python.offer` | The outside doors it is offered to. |
| `option.python.deprecated` | Marks it as going away, in the API description and in its answers. |
| `option.python.system` | Gives it full access, with the reason. |
| `option.python.was` | Its old name, where it was renamed. |

## Returns

A function that answers a promise, called like an action.

## Errors

`code.T0010`: it was called with no engine: nothing stands in the runtime slot.

`code.T7119`: the code raised an error, its Python program ended, or it passed its memory.

`code.T7020`: its lock is not there, or was made from other entries of `packages`.

`code.T0016`: the Python, the installer or a package could not be fetched, or a package file does not fit its lock.

`code.T0008`: the call took longer than `limits.time`.

`code.T1014`: an entry of `packages` holds an option or an address.

## See also

`topic.words`, `word.action`
