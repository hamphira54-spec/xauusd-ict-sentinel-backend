const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'trades.json');

function ensureDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ trades: [], fingerprints: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function appendTrade(trade) {
  const db = readDb();
  db.trades.push(trade);
  writeDb(db);
  return trade;
}

function saveFingerprint(fingerprint, meta) {
  const db = readDb();
  db.fingerprints[fingerprint] = meta;
  writeDb(db);
}

function getFingerprint(fingerprint) {
  const db = readDb();
  return db.fingerprints[fingerprint] || null;
}

module.exports = { DB_FILE, ensureDb, readDb, writeDb, appendTrade, saveFingerprint, getFingerprint };
