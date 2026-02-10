const dbService = require('../services/db.service');

const getHealth = (req, res) => {
  const healthInfo = dbService.getHealth();
  res.json(healthInfo);
};

const pingDb = async (req, res) => {
  try {
    const r = await dbService.pingDb();
    res.json({ status: 'ok', db: r });
  } catch (err) {
    console.error('DB ping error:', err);
    res.status(500).json({ error: 'DB ping failed', detail: err.message });
  }
};

const getTables = async (req, res) => {
  try {
    const tables = await dbService.getTables();
    res.json({ tables });
  } catch (err) {
    console.error('List tables error:', err);
    res.status(500).json({ error: 'Failed to list tables', detail: err.message });
  }
};

const describeTable = async (req, res) => {
  try {
    const schema = req.query.schema || 'public';
    const table = req.query.table;
    const description = await dbService.describeTable(schema, table);
    res.json(description);
  } catch (err) {
    if (err.message === 'Missing query param "table"') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Describe table error:', err);
    res.status(500).json({ error: 'Failed to describe table', detail: err.message });
  }
};

const seedDb = async (req, res) => {
  try {
    const result = await dbService.seedDb();
    res.json(result);
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: 'Seed failed', detail: err.message });
  }
};

module.exports = {
  getHealth,
  pingDb,
  getTables,
  describeTable,
  seedDb,
};