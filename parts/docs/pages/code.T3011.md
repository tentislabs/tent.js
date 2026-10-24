# T3011 secrets-not-searched

A build found a secrets file that this computer cannot open, so its guard searched the browser code for none of the values of that file. A note of the build.

## Details

The guard of the build searches every finished browser file for each secret value of this computer, and stops the build where it finds one (`code.T3007`). It can look only for the values that it can open. A secrets file of the data folder, `secrets.test` or `secrets.live`, that lies there and does not open under the key at hand, or with no key at hand, holds values that nothing here can look for. The build goes on, and says which file it could not search for.

It happens where a data folder was copied from another computer without its key, and on a build machine that is handed the folder and not `TENT_SECRET_KEY`.

## The fix

Build where the key of the secrets is at hand: as the variable `TENT_SECRET_KEY`, or as the file `secret.key` of the data folder. Where the file belongs to another computer and holds nothing that this build could leak, the note may stand.

## See also

`code.T3007`, `command.secrets`, `command.build`
