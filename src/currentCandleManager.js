// src/currentCandleManager.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CurrentCandleManager {
  constructor() {
    this.currentCandles = new Map();
    this.initializeFiles();
  }

  async initializeFiles() {
    const timeframes = [config.timeFrame, config.anchorPeriod];
    for (const tf of timeframes) {
      this.currentCandles.set(tf, null);
      const candleFile = path.join(__dirname, '../data', `candle_current_${tf}.json`);
      await fs.writeFile(candleFile, JSON.stringify(null), { flag: 'w' });
    }
  }

  async saveCurrentCandle(timeframe) {
    const candle = this.currentCandles.get(timeframe);
    const filePath = path.join(__dirname, '../data', `candle_current_${timeframe}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(candle, null, 2));
    } catch (error) {
      console.error(chalk.red(`Errore nel salvataggio della candela corrente (${timeframe}): ${error.message}`));
    }
  }

  async processTrade(trade) {
    const timeframes = [config.timeFrame, config.anchorPeriod];
    for (const tf of timeframes) {
      const interval = this.parseTimeframe(tf);
      const timestamp = Math.floor(trade.timestamp / interval) * interval;
      let candle = this.currentCandles.get(tf);

      if (!candle || candle.timestamp !== timestamp) {
        if (candle) {
          await this.saveCurrentCandle(tf);
        }
        candle = {
          timestamp,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volumeBuy: 0,
          volumeSell: 0,
          cvd: 0,
        };
        this.currentCandles.set(tf, candle);
      }

      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      if (trade.side === 'Buy') {
        candle.volumeBuy += trade.size;
        candle.cvd += trade.size;
      } else {
        candle.volumeSell += trade.size;
        candle.cvd -= trade.size;
      }
    }
  }

  parseTimeframe(tf) {
    const unit = tf.slice(-1);
    const value = parseInt(tf.slice(0, -1));
    return unit === 'm' ? value * 60 * 1000 : value * 60 * 60 * 1000;
  }
}

export default CurrentCandleManager;