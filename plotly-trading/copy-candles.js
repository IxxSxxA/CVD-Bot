const fs = require('fs').promises;
const path = require('path');

const sourceFile = path.resolve(__dirname, '../data/candles_1m.json');
const destFile = path.resolve(__dirname, 'public/data/candles_1m.json');

async function copyCandles() {
  try {
    await fs.copyFile(sourceFile, destFile);
    console.log(`[${new Date().toLocaleTimeString()}] Copiato candles_1m.json`);
  } catch (err) {
    console.error(`Errore copia: ${err.message}`);
  }
}

async function main() {
  // Crea cartella public/data se non esiste
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  // Copia iniziale
  await copyCandles();
  // Copia ogni 1s
  setInterval(copyCandles, 1000);
}

main();