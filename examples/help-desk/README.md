# Help desk

A help desk with an AI agent, built with Tent.js. Mail to the support address becomes a ticket, and staff answer in a screen. An agent drafts answers from past tickets and from a guide of PDF files, and remembers each ticket's conversation. It may look an order up, and it asks before it refunds. Customers can also ask it out loud, and other tools read tickets through an API and through MCP.

## What it shows

- A hook that turns incoming mail into tickets, in `functions/incoming.ts`
- An agent with tools, a memory per ticket, and an ask before a refund, in `functions/helper.ts`
- A search over the PDF files of the guide, in `functions/guides.ts`
- Speech in and out, in `functions/voice.ts`
- Functions offered as an API, as an MCP server and as a command line, in `functions/tickets.ts`
- A sign-in by a code sent by mail
- Tests with faked models and services in `tests/`, and a test of the agent against real models in `tests/helper.ai.ts`

## Run it

```sh
npm install -g tentjs
git clone https://github.com/tentislabs/tent.js
cd tent.js/examples/help-desk
npm install
tent secrets set ANTHROPIC_KEY
tent secrets set OPENAI_KEY
tent dev
```

The app also names `MAIL_KEY`, `MAIL_HOOK` and `PAYMENTS_KEY`, for the mail service and the payment service; set them with `tent secrets set` where you connect those. Open `http://localhost:3000` and sign in as `sam@desk.example`, one of the staff: in development the code is not sent, and it waits in the app's mailbox at `http://localhost:3000/_t/mail`.

`tent check` checks the whole app, and `tent test` runs its tests, with every model and service faked.
