# T0028 nested-too-deep

Functions that call each other from code stand deeper in each other than `limits.functionDepth` lets them.

## Details

The call that came through the door is the first, and each function that code calls from inside it stands one deeper. The limit is 100 where the project states none. One call more fails with this code, which names the limit, and a change that it stands in is undone. So functions that call each other with no end come to one.

## The fix

Functions that call each other must come to an end: look for the one that calls itself, straight or through another. Where the calls truly nest that deep, raise `functionDepth` in `limits` of the project.

## See also

`word.project`, `code.T0008`
