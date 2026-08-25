// Precompute stats -> collection `daily_stats` (1 doc = dataset x localDate x hour)
const { connect, METRICS } = require('./lib');

async function main() {
  const { client, db } = await connect();
  const points = db.collection('points');
  const stats = db.collection('daily_stats');
  await stats.drop().catch(() => {});

  const metricGroup = {};
  for (const m of METRICS) {
    metricGroup[`${m}_min`] = { $min: `$${m}` };
    metricGroup[`${m}_avg`] = { $avg: `$${m}` };
    metricGroup[`${m}_max`] = { $max: `$${m}` };
    metricGroup[`${m}_count`] = { $sum: { $cond: [{ $ne: [`$${m}`, null] }, 1, 0] } };
  }

  const cursor = points.aggregate(
    [
      {
        $group: {
          _id: { dataset: '$dataset', localDate: '$localDate', hour: { $floor: { $divide: ['$localMinutes', 60] } } },
          count: { $sum: 1 },
          withCoords: { $sum: { $cond: [{ $ifNull: ['$location', false] }, 1, 0] } },
          ...metricGroup,
        },
      },
    ],
    { allowDiskUse: true }
  );

  const docs = [];
  for await (const g of cursor) {
    const metrics = {};
    for (const m of METRICS) {
      if (g[`${m}_count`] > 0) {
        metrics[m] = { min: g[`${m}_min`], avg: g[`${m}_avg`], max: g[`${m}_max`], count: g[`${m}_count`] };
      }
    }
    docs.push({
      dataset: g._id.dataset,
      localDate: g._id.localDate,
      hour: g._id.hour,
      count: g.count,
      withCoords: g.withCoords,
      metrics,
    });
  }
  if (docs.length) await stats.insertMany(docs);
  await stats.createIndex({ dataset: 1, localDate: 1, hour: 1 });
  console.log(`daily_stats: ${docs.length} docs`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
