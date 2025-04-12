import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import ATR from './atr.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class FVG {
  constructor() {
    this.atr = new ATR();
    this.liveFile = path.join(__dirname, '../../data/fvg_live.json');
    this.historyFile = path.join(__dirname, '../../data/fvg_history.json');
    this.tempFile = path.join(__dirname, '../../data/fvg_history_temp.json');
    this.lockFile = path.join(__dirname, '../../data/fvg_history.lock');
    this.lastSaveTime = 0;
    this.initializeFiles();
  }

  async initializeFiles() {
    try {
      await fs.writeFile(this.liveFile, JSON.stringify(null), { flag: 'w' });
      await fs.writeFile(this.historyFile, JSON.stringify([]), { flag: 'w' });
      await this.cleanupLock();
    } catch (error) {
      console.error(`Errore inizializzazione file FVG: ${error.message}`);
    }
  }

  async cleanupLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Errore pulizia lock FVG iniziale: ${err.message}`);
      }
    }
  }

  async acquireLock() {
    const start = Date.now();
    while (Date.now() - start < 10000) { // 10s timeout
      try {
        await fs.writeFile(this.lockFile, '', { flag: 'wx' });
        return true;
      } catch (err) {
        if (err.code !== 'EEXIST') {
          console.error(`Errore acquisizione lock FVG: ${err.message}`);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    console.error('Timeout acquisizione lock FVG');
    return false;
  }

  async releaseLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Errore rimozione lock FVG: ${err.message}`);
      }
    }
  }

  detect(candles) {
    if (candles.length < config.minimumFvgSize + 1) return null;
    const current = candles[candles.length - 1];
    const prev1 = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    const atr = this.atr.calculate(candles, config.fvgAtrPeriod);

    let fvg = null;
    if (current.high < prev2.low && prev1.close < prev2.low) { // Bearish FVG
      const fvgSize = Math.abs(prev2.low - current.high);
      if (fvgSize * config.fvgSensitivity > atr) {
        fvg = { max: prev2.low, min: current.high, isBull: false, startTime: current.timestamp };
      }
    } else if (current.low > prev2.high && prev1.close > prev2.high) { // Bullish FVG
      const fvgSize = Math.abs(current.low - prev2.high);
      if (fvgSize * config.fvgSensitivity > atr) {
        fvg = { max: current.low, min: prev2.high, isBull: true, startTime: current.timestamp };
      }
    }
    if (fvg) this.saveData(fvg);
    return fvg;
  }

  async saveData(fvg) {
    const now = Date.now();
    if (now - this.lastSaveTime < 3000) return; // Aspetta 3s tra scritture
    this.lastSaveTime = now;

    try {
      await fs.writeFile(this.liveFile, JSON.stringify(fvg, null, 2));

      if (!(await this.acquireLock())) {
        return;
      }
      try {
        let historyData = [];
        try {
          const data = await fs.readFile(this.historyFile, 'utf8');
          if (data) historyData = JSON.parse(data);
          if (!Array.isArray(historyData)) throw new Error('History non è un array');
        } catch (parseError) {
          console.error(`File FVG_history corrotto, resetto: ${parseError.message}`);
          historyData = [];
        }
        historyData.push(fvg);
        await fs.writeFile(this.tempFile, JSON.stringify(historyData, null, 2));
        await fs.rename(this.tempFile, this.historyFile);
      } finally {
        await this.releaseLock();
      }
    } catch (error) {
      console.error(`Errore salvataggio dati FVG: ${error.message}`);
    }
  }
}

export default FVG;