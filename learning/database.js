const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'trades.json');

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ trades: [], fingerprints: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function appendTrade(trade) {
  const db = readDb();
  db.trades.push(trade);
  writeDb(db);
  return trade;
}

function updateTrade(id, patch = {}) {
  const db = readDb();
  const idx = db.trades.findIndex(t => t.id === id);
  if (idx === -1) return null;
  db.trades[idx] = { ...db.trades[idx], ...patch, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.trades[idx];
}

function getFingerprint(fingerprint) {
  return readDb().fingerprints?.[fingerprint] || null;
}

function saveFingerprint(fingerprint, value) {
  const db = readDb();
  db.fingerprints[fingerprint] = value;
  writeDb(db);
}

module.exports = { DB_PATH, ensureDb, readDb, writeDb, appendTrade, updateTrade, getFingerprint, saveFingerprint };
