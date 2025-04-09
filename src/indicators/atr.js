// src/indicators/atr.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class ATR {
  constructor() {
    this.liveFile = path.join(__dirname, '../../data/atr_live.json');
    this.historyFile = path.join(__dirname, '../../data/atr_history.json');
    this.initializeFiles();
  }

  async initializeFiles() {
    try {
      await fs.writeFile(this.liveFile, JSON.stringify({ atr: 0 }), { flag: 'w' });
      await fs.writeFile(this.historyFile, JSON.stringify([]), { flag: 'w' });
    } catch (error) {
      console.error(`Errore inizializzazione file ATR: ${error.message}`);
    }
  }

  calculate(candles, period) {
    if (candles.length < period) return 0;
    let trSum = 0;
    for (let i = 0; i < period; i++) {
      const candle = candles[candles.length - 1 - i];
      const prevCandle = i > 0 ? candles[candles.length - 2 - i] : null;
      const tr = Math.max(candle.high - candle.low,
                          Math.abs(candle.high - (prevCandle?.close || candle.open)),
                          Math.abs(candle.low - (prevCandle?.close || candle.open)));
      trSum += tr;
    }
    const atr = trSum / period;
    this.saveData(atr, candles[candles.length - 1].timestamp);
    return atr;
  }

  async saveData(atr, timestamp) {
    try {
      // Salva dato live
      const liveData = { atr, timestamp };
      await fs.writeFile(this.liveFile, JSON.stringify(liveData, null, 2));

      // Append allo storico
      const historyData = JSON.parse(await fs.readFile(this.historyFile, 'utf8'));
      historyData.push(liveData);
      await fs.writeFile(this.historyFile, JSON.stringify(historyData, null, 2));
    } catch (error) {
      console.error(`Errore salvataggio dati ATR: ${error.message}`);
    }
  }
}

export default ATR;