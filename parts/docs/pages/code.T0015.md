# T0015 cannot-read

`files.text` was asked for the words of a file of a kind that no reader knows, or of a file that its reader cannot read.

## Details

The engine reads plain text, Markdown, CSV, JSON and any other `text/*`, HTML, a Word document (`.docx`) and a PDF. The kind is the one stored with the file, and the ending of its name decides where the kind says nothing. A file that states the kind of a Word document and is none fails with this code too.

## The fix

Read a file of a kind that a reader knows, or connect a `TextReader` for the kind in `engine.ts`. Where the kind that is stored with the file is wrong, code with full access sets it with `files.setKind`.

## See also

`handle.files`
