# T7119 python-failed

A call of a `python` failed in its Python code or in its Python program. A caller gets T0009 with a reference that finds the error in the log, which holds the Python trace.

## Details

- the code raised an error that is no `tent.Fail`: the log holds its Python trace, under the name of the definition;
- its Python program ended in the middle of the call: a native package crashed, or the program was ended. That call alone fails: the next call starts a new Python program, and the engine keeps answering;
- the call took more memory than `limits.memory` of the definition, 1 GB where it states none: the words name the limit. A watch inside the Python program measures what the call added to what the program held when it began, once a second;
- `run` answered a value that has no plain form: no text, number, true or false, list, record or date, and no value of a package that gives its own plain form, as a number or a list of a number package does. The words name the field;
- `run` answered for a `file` of its output a path that is no plain file of the folder of the call, `tent.folder`, also after every link is followed, or a file larger than `uploadSize`: nothing is stored then;
- the Python program sent a frame larger than `limits.pythonFrameSize`, 16 MB: data that is larger travels as a file.

An app's own failure is `raise tent.Fail(code, message, fields)`, which the caller sees with its code and the status 400. A call that Python made through `tent.call` and let out of `run` arrives as itself.

## The fix

Read the trace in the log (`tent logs`), and mend the code of the definition. Give a definition that needs more a larger `limits.memory` or `limits.time`, and write a large answer into `tent.folder` as a file.

## See also

`word.python`, `option.python.limits`, `code.T0008`, `command.python`
