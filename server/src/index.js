require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mongo: mongoose.connection.readyState === 1 });
});

const PORT = process.env.PORT || 3001;

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error(
      'ไม่พบ MONGODB_URI — คัดลอก .env.example เป็น .env ที่ root โปรเจกต์ แล้วใส่ connection string ของ MongoDB Atlas'
    );
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
