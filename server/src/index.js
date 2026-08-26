const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

const PORT = process.env.PORT || 3001;

async function main() {
  const db = await connectDB();
  console.log('MongoDB connected');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' })); // zone geometry ใหญ่ได้

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/datasets', require('./routes/datasets')(db));
  app.use('/api/points', require('./routes/points')(db));
  app.use('/api/tracks', require('./routes/tracks')(db));
  app.use('/api/stats', require('./routes/stats')(db));
  app.use('/api/zones', require('./routes/zones')(db));

  // error handler กลาง — status จาก badRequest หรือ 500
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message });
  });

  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
