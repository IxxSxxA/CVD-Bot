import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ATR {
  constructor() {
    this.liveFile = path.join(__dirname, '../../data/atr_live.json');
    this.historyFile = path.join(__dirname, '../../data/atr_history.json');
    this.tempFile = path.join(__dirname, '../../data/atr_history_temp.json');
    this.lockFile = path.join(__dirname, '../../data/atr_history.lock');
    this.lastSaveTime = 0;
    this.initializeFiles();
  }

  async initializeFiles() {
    try {
      await fs.writeFile(this.liveFile, JSON.stringify({ atr: 0 }), { flag: 'w' });
      await fs.writeFile(this.historyFile, JSON.stringify([]), { flag: 'w' });
      await this.cleanupLock();
    } catch (error) {
      console.error(`Errore inizializzazione file ATR: ${error.message}`);
    }
  }

  async cleanupLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Errore pulizia lock ATR iniziale: ${err.message}`);
      }
    }
  }

  async acquireLock() {
    const start = Date.now();
    while (Date.now() - start < 10000) {
      try {
        await fs.writeFile(this.lockFile, '', { flag: 'wx' });
        return true;
      } catch (err) {
        if (err.code !== 'EEXIST') {
          console.error(`Errore acquisizione lock ATR: ${err.message}`);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    console.error('Timeout acquisizione lock ATR');
    return false;
  }

  async releaseLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Errore rimozione lock ATR: ${err.message}`);
      }
    }
  }

  calculate(candles, period) {
    if (candles.length < period) return 0;
    let trSum = 0;
    for (let i = 0; i < period; i++) {
      const candle = candles[candles.length - 1 - i];
      const prevCandle = i > 0 ? candles[candles.length - 2 - i] : null;
      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - (prevCandle?.close || candle.open)),
        Math.abs(candle.low - (prevCandle?.close || candle.open))
      );
      trSum += tr;
    }
    const atr = trSum / period;
    this.saveData(atr, candles[candles.length - 1].timestamp);
    return atr;
  }

  async saveData(atr, timestamp) {
    const now = Date.now();
    if (now - this.lastSaveTime < 3000) return;
    this.lastSaveTime = now;

    try {
      const liveData = { atr, timestamp };
      await fs.writeFile(this.liveFile, JSON.stringify(liveData, null, 2));

      if (!(await this.acquireLock())) {
        return;
      }
      try {
        let historyData = [];
        try {
          const data = await fs.readFile(this.historyFile, 'utf8');
          if (data) historyData = JSON.parse(data);
        } catch (err) {
          console.error(`Errore lettura storico ATR: ${err.message}`);
          historyData = [];
        }
        historyData.push(liveData);
        await fs.writeFile(this.tempFile, JSON.stringify(historyData, null, 2));
        await fs.rename(this.tempFile, this.historyFile);
      } finally {
        await this.releaseLock();
      }
    } catch (error) {
      console.error(`Errore salvataggio dati ATR: ${error.message}`);
    }
  }
}

export default ATR;