// src/indicators/cvd.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CVD {
  constructor() {
    this.liveFile = path.join(__dirname, '../../data/cvd_live.json');
    this.historyFile = path.join(__dirname, '../../data/cvd_history.json');
    this.initializeFiles();
  }

  async initializeFiles() {
    try {
      await fs.writeFile(this.liveFile, JSON.stringify(null), { flag: 'w' });
      await fs.writeFile(this.historyFile, JSON.stringify([]), { flag: 'w' });
    } catch (error) {
      console.error(`Errore inizializzazione file CVD: ${error.message}`);
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
    } else { // Raw
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
    try {
      // Salva dato live
      const liveData = { signal, timestamp };
      await fs.writeFile(this.liveFile, JSON.stringify(liveData, null, 2));

      // Append allo storico
      const historyData = JSON.parse(await fs.readFile(this.historyFile, 'utf8'));
      historyData.push(liveData);
      await fs.writeFile(this.historyFile, JSON.stringify(historyData, null, 2));
    } catch (error) {
      console.error(`Errore salvataggio dati CVD: ${error.message}`);
    }
  }
}

export default CVD;