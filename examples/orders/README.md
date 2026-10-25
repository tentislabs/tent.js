# Orders

An orders tool for a small shop, built with Tent.js. Staff see every order, find one, open it and mark it paid, and add customers and orders. A customer signs in and sees only their own orders. A change one person makes shows in every open page, with no reload.

## What it shows

- Tables with the rules of who may read and change their rows, in `tables/`
- A sign-in of the app's own, with the roles `staff` and customer
- Queries and changes in `functions/`, read and called by the React screens of `screens/`
- Live updates in every open page
- English and Turkish, in `messages/`
- A seed of people, customers and orders, in `seed.ts`
- Tests in `tests/`, and a walk through the app in a real browser in `walk/`

## Run it

```sh
npm install -g tentjs
git clone https://github.com/tentislabs/tent.js
cd tent.js/examples/orders
npm install
tent dev
```

Open `http://localhost:3000` and sign in as `sam@shop.example`, one of the staff, with the password `a long secret`, which the seed gives every person on the data of development.

`tent check` checks the whole app, and `tent test` runs its tests.
