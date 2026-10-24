# `tent service`

Prints, for the system it runs on, what starts an app as a server and starts it again when it ends: it takes the words of `tent start`, without the word `start` itself. It prints and installs nothing by itself.

## Usage

```
tent service <bundle> [the words of tent start] [--machine] [--line]
tent service <bundle> [the words of tent start] --install [--user <name>] [--yes]
```

## Options

| Option | Means |
|---|---|
| `--line` | Prints the one line that starts the app, for a wrapper of your own |
| `--machine` | The app starts with the machine, as the user it runs as, in place of at that user's sign-in |
| `--install` | Writes the definition where the system reads it. Where the system wants an administrator, it prints the one line to type with those rights. Started as root with no `--user`, it stops and names the user to type. Where `--secret-key-from` names a file that is not there, and the data folder holds no `secret.key`, it makes that file with a new key |
| `--user <name>` | The user the app runs as. Left out, it is the current user |
| `--yes` | Writes over a definition of the same name, which it shows and leaves otherwise |

| System | What is printed |
|---|---|
| Linux | A systemd unit, `tent-<name>.service`, which starts the app with the machine as its user, with the right to the low ports alone |
| macOS | A launchd file, `com.tentjs.<name>.plist`: of the person, which starts at their sign-in and needs no administrator, or with `--machine` of the machine |
| Windows | A task of the task scheduler, as its own XML: at the sign-in of this user, or with `--machine` at start-up, as that user with no password kept, and started again a minute after a failure. For a Windows service, hand the line to a wrapper of your own |

Each file it names is held by its whole path. The key of the secrets is never in a definition: `--secret-key-from <file>` names the file that holds it. Every word is written as the system's form asks, and a word with a line break is refused. It refuses a launcher or a data folder that the user does not own or that others can write, and a file of the key that others can read.

## Example

```
tent service /srv/shop --data /var/shop --domain shop.example.com --secret-key-from /var/shop.key
sudo tent service /srv/shop --data /var/shop --domain shop.example.com --secret-key-from /var/shop.key --install --user shop
```

## Output

The definition, as text. With `--json`, it is the value; after `--install`, the place it was written:

```json
{ "ok": true, "value": { "installed": "/etc/systemd/system/tent-shop.service" }, "findings": [] }
```

## Errors

`code.T0013` for a word with a line break, a folder or a file that others can change or read, an install that wants an administrator, a start as root with no `--user`, and a definition of the same name without `--yes`. `code.T0011` for a folder that holds no bundle.

## See also

`command.start`, `topic.engine`
