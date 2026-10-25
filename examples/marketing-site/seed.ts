import { seed } from 'tentjs'
import { features } from './tables/features'

export default seed([
  features.add({
    name: 'The till',
    summary: 'A till on any tablet or phone, that keeps selling when the network is gone.',
    body: [
      'The till of Tillwise runs in the browser of any **tablet**, **phone** or **computer**.',
      '',
      '## What it does',
      '',
      '- Scans a barcode with the camera, or finds a product by its first letters',
      '- Takes card, phone and cash in one basket',
      '- Prints or mails the receipt',
      '',
      'When the network drops, the till goes on selling, and sends each sale once it is back.',
    ].join('\n'),
    picture: 'till.png',
    video: 'https://www.youtube-nocookie.com/embed/tillwise-till',
  }),
  features.add({
    name: 'Stock that follows',
    summary: 'Every sale takes its products off the stock, on every till at once.',
    body: [
      'Each sale takes what it sold off the stock, the moment it is paid.',
      '',
      '## Running low',
      '',
      'Set a least count for a product, and Tillwise tells you **before** the shelf is empty.',
      '',
      '1. Pick the product',
      '2. Write the least count',
      '3. Get a note the day it is reached',
    ].join('\n'),
    picture: 'stock.png',
    video: 'https://www.youtube-nocookie.com/embed/tillwise-stock',
  }),
  features.add({
    name: 'Orders by phone',
    summary: 'Take an order on the phone, and have it ready when the customer comes.',
    body: [
      'An order holds the customer, the products and the day they come for it.',
      '',
      'The shelf keeps what an order holds aside, so it is never sold twice.',
    ].join('\n'),
    picture: 'orders.png',
  }),
  features.add({
    name: 'The day in numbers',
    summary: 'What sold, when and to whom, in one page at the end of the day.',
    body: [
      'At closing time one page shows the takings of the day, by the hour and by the product.',
      '',
      '> The busiest hour is the one to staff first.',
    ].join('\n'),
    picture: 'numbers.png',
  }),
  features.add({
    name: 'Many shops',
    summary: 'Several shops and their tills under one account, each with its own stock.',
    body: [
      'Open a second shop, and its tills, its stock and its staff stand apart from the first.',
      '',
      'Move stock from one shop to another in two presses.',
    ].join('\n'),
    picture: 'shops.png',
  }),
])
