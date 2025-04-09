// src/indicators/fvg.js
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
    this.initializeFiles();
  }

  async initializeFiles() {
    try {
      await fs.writeFile(this.liveFile, JSON.stringify(null), { flag: 'w' });
      await fs.writeFile(this.historyFile, JSON.stringify([]), { flag: 'w' });
    } catch (error) {
      console.error(`Errore inizializzazione file FVG: ${error.message}`);
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
    try {
      await fs.writeFile(this.liveFile, JSON.stringify(fvg, null, 2));
      let historyData;
      try {
        historyData = JSON.parse(await fs.readFile(this.historyFile, 'utf8'));
        if (!Array.isArray(historyData)) throw new Error('History non è un array');
      } catch (parseError) {
        console.error(`File FVG_history corrotto, resetto: ${parseError.message}`);
        historyData = []; // Resetta se corrotto
      }
      historyData.push(fvg);
      await fs.writeFile(this.historyFile, JSON.stringify(historyData, null, 2));
    } catch (error) {
      console.error(`Errore salvataggio dati FVG: ${error.message}`);
    }
  }
}

export default FVG;