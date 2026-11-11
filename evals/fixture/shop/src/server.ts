import { createServer } from 'node:http'

import { priceCart } from './cart.ts'
import { saveOrder } from './orders.ts'

const PORT = 8471

createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  if (req.url === '/price') return res.end(JSON.stringify(priceCart(body.items, body.coupon)))
  if (req.url === '/order') return res.end(JSON.stringify(saveOrder(body.customer, body.items, body.coupon)))
  res.statusCode = 404
  res.end()
}).listen(PORT)
