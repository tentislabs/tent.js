# T9106 edit-not-found

The text that the project tool `edit` was to replace does not stand in the file exactly once: it stands nowhere, or more than once. Nothing was written.

## Details

How often the text stands is sent in `fields`, under `count`, and in the words of the error, so a model that called the tool reads it: `0` where the file holds the text nowhere, as after the file changed since it was read, and a number above one where it stands several times.

## The fix

Read the file again with `read`, and replace a text that stands in it once: take more of the lines around it, so that it is one place and no other.

## See also

`topic.workspaces`, `code.T9105`
