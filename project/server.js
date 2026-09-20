const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const bot = new Telegraf("8776211345:AAGGltDLhxuujLGOYcpPY1gp2SPsV469h7E");
const app = express();
app.use(cors());
app.use(express.json());

// Simple Mock Database
const categories = ['Electronics', 'Clothing', 'Home'];
const products = [
  { id: 1, name: 'Sample Phone', category: 'Electronics', price: 299 }
];

// Listen for /start command in Telegram
bot.start((ctx) => {
  ctx.reply(
    `Welcome to the Market! 🛍️\nChoose your viewpoint:`,
    Markup.inlineKeyboard([
      [Markup.button.webApp('🛒 Open Buyer Shop', `${process.env.WEBAPP_URL}?role=buyer`)],
      [Markup.button.webApp('🏪 Open Merchant Panel', `${process.env.WEBAPP_URL}?role=merchant`)]
    ])
  );
});

// API endpoints for your React app to fetch and save data
app.get('/api/products', (req, res) => res.json({ categories, products }));
app.post('/api/products', (req, res) => {
  const newProduct = { id: products.length + 1, ...req.body, price: Number(req.body.price) };
  products.push(newProduct);
  res.status(201).json(newProduct);
});

bot.launch();
.then(() => console.log('✅ Bot launched successfully'))
.catch((err) => console.error('❌ Bot launch failed:', err));
app.listen(5000, () => console.log('Backend running on port 5000'));
