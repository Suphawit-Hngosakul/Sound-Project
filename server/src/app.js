const express = require('express');
const cors = require('cors');
const compression = require('compression');

// แยกการประกอบ app ออกจากการต่อ DB — เทสต์จะได้ยิง API จริงกับ mongod ในเครื่องได้
function createApp(db) {
  const app = express();
  app.use(cors());
  // /api/points ของ Walking = 2.3 MB JSON ล้วน — gzip เหลือราว 1/5
  app.use(compression());
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

  return app;
}

module.exports = { createApp };
