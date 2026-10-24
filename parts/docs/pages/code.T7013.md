# T7013 api-file-broken

The published description of an API that a service names in `from` could not be read for the calls that `use` names. The build raises it, on the line of the service.

## Details

An error, which stops the build:

- the file cannot be read as JSON, or is no description of an API in version 3.0 or 3.1;
- an operation that `use` names is not in the file, by its `operationId` or, where it has none, by its method and its path;
- an operation id that is no name of ours, as `post-refunds`, is named by no key of `use`;
- two calls get one name, or a parameter and a field of the body of one call have one name.

A warning, one for each: a part of a used call that had to be taken as `json` (a choice between shapes, free keys, a shape that holds itself), and a reference that leads out of the file.

Nothing of the file but the named operations is looked at, so a broken part that no used call needs breaks nothing. `tent api read` raises it too, for a file that is no description of an API.

## The fix

Name the operations as the file names them, or give a call a name of your own: `use: { createRefund: 'PostRefunds' }`. A file in YAML, or of the version before 3.0, is turned into JSON of 3.1 with `tent api read`. A call whose type matters and that had to be taken as `json` is written by hand in `calls`.

## See also

`option.service.from`, `option.service.use`, `command.api`
