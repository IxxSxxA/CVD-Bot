import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CurrentCandleManager {
  constructor() {
    this.currentCandle = null;
    this.timeframeMs = this.getTimeframeMs(config.timeFrame);
    this.initializeFile();
  }

  getTimeframeMs(timeframe) {
    const minute = 60 * 1000;
    return timeframe === '1m' ? minute :
           timeframe === '3m' ? 3 * minute :
           timeframe === '5m' ? 5 * minute :
           timeframe === '15m' ? 15 * minute :
           timeframe === '1h' ? 60 * minute : minute;
  }

  async initializeFile() {
    const dataDir = path.join(__dirname, '../data');
    try {
      await fs.writeFile(
        path.join(dataDir, `candle_current_${config.timeFrame}.json`),
        JSON.stringify(null),
        { flag: 'w' }
      );
      console.log(chalk.gray(`File candle_current_${config.timeFrame}.json inizializzato`));
    } catch (error) {
      console.error(chalk.red(`Errore inizializzazione file candle_current: ${error.message}`));
    }
  }

  updateCurrentCandle(trade) {
    const timestamp = Math.floor(trade.timestamp / this.timeframeMs) * this.timeframeMs;

    if (!this.currentCandle || this.currentCandle.timestamp < timestamp) {
      this.currentCandle = {
        timestamp,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volumeBuy: 0,
        volumeSell: 0,
        cvd: 0 // Inizia a 0 per la nuova candela
      };
    }

    this.currentCandle.high = Math.max(this.currentCandle.high, trade.price);
    this.currentCandle.low = Math.min(this.currentCandle.low, trade.price);
    this.currentCandle.close = trade.price;
    this.currentCandle.volumeBuy += trade.side === 'Buy' ? trade.volume : 0;
    this.currentCandle.volumeSell += trade.side === 'Sell' ? trade.volume : 0;
    this.currentCandle.cvd += (trade.side === 'Buy' ? trade.volume : 0) - (trade.side === 'Sell' ? trade.volume : 0);

    this.saveCurrentCandle();
  }

  async saveCurrentCandle() {
    const filePath = path.join(__dirname, '../data', `candle_current_${config.timeFrame}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(this.currentCandle, null, 2));
    } catch (error) {
      console.error(chalk.red(`Errore salvataggio candle_current_${config.timeFrame}.json: ${error.message}`));
    }
  }
}

export default CurrentCandleManager;