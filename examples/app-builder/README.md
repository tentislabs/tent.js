# App builder

An AI app builder, built with Tent.js. People sign in, describe an app in a chat, and an AI builds it for them. Each sees their app beside the chat, can point at a part of it and ask for a change, can undo the last turn, and can publish. Nothing one person's AI writes reaches another person's app.

## What it shows

- The product itself, an app in `product/`
- A program of its own around it, `server.ts`, that holds one engine with the product, a workspace for each person, and the apps they published
- Workspaces that keep each person's app apart, and a box that runs what the AI writes, in `box.ts`
- A walk through the product in Chromium, Firefox and WebKit, in `walk/`

## Run it

```sh
npm install -g tentjs
git clone https://github.com/tentislabs/tent.js
cd tent.js/examples/app-builder/product
npm install
tent build --out ../bundle
cd ..
npm install tentjs
tent secrets set ANTHROPIC_KEY --data run/data
node server.ts bundle
```

The product answers at `http://builder.localhost:3000`, and each published app under a name of its own below it. `node server.ts <bundle> [--port 3000] [--folder ./run]` names another port or folder.
