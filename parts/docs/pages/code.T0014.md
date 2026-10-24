# T0014 no-users-table

A user is needed, and the app has no `users` table.

## Details

A user of an app is a row of its own table `users`. In a test, `app.user(values)` adds such a row, and `app.as(id)` reads one to make its caller: both fail with this code in an app that has no table of that name. `app.as('nobody')` and `app.as('system')` need no user, and work in every app.

## The fix

Add a table named `users` to the project, with a `roles` column where the rules of the app name roles. In a test of an app that has no users, call as `'nobody'` or as `'system'`.

## See also

`topic.tests`, `word.table`
