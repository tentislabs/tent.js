# Marketing site

The site of a product, built with Tent.js: a home page that moves, a pricing page, a gallery of screenshots that opens a page for each feature, and a contact form. In English and Turkish, with every page served as whole HTML for search engines, and fast on a phone.

## What it shows

- Pages read by anyone, with no sign-in
- A table of features with Markdown bodies and pictures, in `tables/` and `assets/`
- A contact form that stores what is sent, in `functions/messages.ts`
- English and Turkish, each page at an address of its own
- A sitemap, and pages that search engines read whole
- Tests in `tests/`, and a walk through the site in a real browser in `walk/`

## Run it

```sh
npm install -g tentjs
git clone https://github.com/tentislabs/tent.js
cd tent.js/examples/marketing-site
npm install
tent dev
```

Open `http://localhost:3000`. `tent check` checks the whole app, and `tent test` runs its tests.
