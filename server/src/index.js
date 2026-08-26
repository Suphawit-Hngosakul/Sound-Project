const { connectDB } = require('./db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3001;

async function main() {
  const db = await connectDB();
  console.log('MongoDB connected');
  createApp(db).listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
