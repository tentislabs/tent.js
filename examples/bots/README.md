# Bots

Always-on bots that work for you, on your own computer, built with Tent.js. Each bot has a name, a brief that says what it is for, and a memory of its own that lasts. A bot runs on a routine, on a schedule or when something happens, and you can talk to it. Bots hand work to each other, and one, the chief, routes what you ask to the right bot and tells you when it needs you.

## What it shows

- Agents with a memory each, and a chief that routes work, in `agents/`
- Routines on a schedule and on events, in `functions/routines.ts` and `flows/`
- Tools through MCP servers and through services, with keys a bot never sees
- An ask before anything that sends, pays or deletes, answered yes or no at `/asks`
- Models you pick, here through Claude Code on your computer, and a limit on a day's use, in `models/` and `functions/usage.ts`
- The app as a service of the computer, and a desktop window of Tauri around it, in `desktop/`

## Run it

```sh
npm install -g tentjs
git clone https://github.com/tentislabs/tent.js
cd tent.js/examples/bots
npm install
tent dev
```

Open `http://localhost:3000` and sign in as `sam@example.com` with the password `a long secret`. The models run through Claude Code, so it must be installed and signed in on the computer.

To keep it running all the time, `tent build --out bundle` and then `tent service bundle --data data --port 4805`. The window in `desktop/` starts the app where it is not running and shows it.
