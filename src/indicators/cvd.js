import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CVD {
  constructor() {
    this.liveFile = path.join(__dirname, '../../data/cvd_live.json');
    this.historyFile = path.join(__dirname, '../../data/cvd_history.json');
    this.tempFile = path.join(__dirname, '../../data/cvd_history_temp.json');
    this.lockFile = path.join(__dirname, '../../data/cvd_history.lock');
    this.lastSaveTime = 0;
    this.initializeFiles();
  }

  async initializeFiles() {
    try {
      await fs.writeFile(this.liveFile, JSON.stringify(null), { flag: 'w' });
      await fs.writeFile(this.historyFile, JSON.stringify([]), { flag: 'w' });
      await this.cleanupLock();
    } catch (error) {
      console.error(`Errore inizializzazione file CVD: ${error.message}`);
    }
  }

  async cleanupLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Errore pulizia lock CVD iniziale: ${err.message}`);
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
          console.error(`Errore acquisizione lock CVD: ${err.message}`);
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    console.error('Timeout acquisizione lock CVD');
    return false;
  }

  async releaseLock() {
    try {
      await fs.unlink(this.lockFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Errore rimozione lock CVD: ${err.message}`);
      }
    }
  }

  detect(anchorCandles) {
    if (anchorCandles.length < 2) return null;
    const current = anchorCandles[anchorCandles.length - 1];
    const prev = anchorCandles[anchorCandles.length - 2];
    let signal = null;

    if (config.cvdSignalType === 'Advanced') {
      if (current.close > current.open && current.cvd < 0 && prev.cvd >= 0) {
        signal = 'Bear';
      } else if (current.close < current.open && current.cvd > 0 && prev.cvd <= 0) {
        signal = 'Bull';
      }
    } else {
      if (current.cvd < 0 && prev.cvd >= 0) {
        signal = 'Bear';
      } else if (current.cvd > 0 && prev.cvd <= 0) {
        signal = 'Bull';
      }
    }
    if (signal) this.saveData(signal, current.timestamp);
    return signal;
  }

  async saveData(signal, timestamp) {
    const now = Date.now();
    if (now - this.lastSaveTime < 3000) return;
    this.lastSaveTime = now;

    try {
      const liveData = { signal, timestamp };
      await fs.writeFile(this.liveFile, JSON.stringify(liveData, null, 2));

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
          console.error(`File CVD_history corrotto, resetto: ${parseError.message}`);
          historyData = [];
        }
        historyData.push(liveData);
        await fs.writeFile(this.tempFile, JSON.stringify(historyData, null, 2));
        await fs.rename(this.tempFile, this.historyFile);
      } finally {
        await this.releaseLock();
      }
    } catch (error) {
      console.error(`Errore salvataggio dati CVD: ${error.message}`);
    }
  }
}

export default CVD;