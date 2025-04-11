// src/dataAggregator.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import chalk from 'chalk';
import CurrentCandleManager from './currentCandleManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DataAggregator {
  constructor() {
    this.candles = new Map();
    this.tradesReceived = 0;
    this.currentCandleManager = new CurrentCandleManager();
    this.initialize();
  }

  async initialize() {
    const timeframes = [config.timeFrame, config.anchorPeriod];
    timeframes.forEach((tf) => {
      this.candles.set(tf, []);
    });
    this.tradeCountLog();
  }

  tradeCountLog() {
    setInterval(() => {
      console.log(chalk.gray(`Trade ricevuti: ${this.tradesReceived}`));
    }, 60000);
  }

  async saveCandles(timeframe) {
    const candles = this.candles.get(timeframe);
    const filePath = path.join(__dirname, '../data', `candles_${timeframe}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(candles, null, 2));
    } catch (error) {
      console.error(chalk.red(`Errore nel salvataggio delle candele (${timeframe}): ${error.message}`));
    }
  }

  async processTrade(trade) {
    this.tradesReceived++;
    await this.currentCandleManager.processTrade(trade);

    const timeframes = [config.timeFrame, config.anchorPeriod];
    for (const tf of timeframes) {
      const interval = this.parseTimeframe(tf);
      const timestamp = Math.floor(trade.timestamp / interval) * interval;
      const candles = this.candles.get(tf);
      const lastCandle = candles[candles.length - 1];

      if (!lastCandle || lastCandle.timestamp !== timestamp) {
        const newCandle = {
          timestamp,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volumeBuy: 0,
          volumeSell: 0,
          cvd: 0,
        };
        if (trade.side === 'Buy') {
          newCandle.volumeBuy = trade.size;
          newCandle.cvd = trade.size;
        } else {
          newCandle.volumeSell = trade.size;
          newCandle.cvd = -trade.size;
        }
        candles.push(newCandle);
      } else {
        lastCandle.high = Math.max(lastCandle.high, trade.price);
        lastCandle.low = Math.min(lastCandle.low, trade.price);
        lastCandle.close = trade.price;
        if (trade.side === 'Buy') {
          lastCandle.volumeBuy += trade.size;
          lastCandle.cvd += trade.size;
        } else {
          lastCandle.volumeSell += trade.size;
          lastCandle.cvd -= trade.size;
        }
      }
      await this.saveCandles(tf);
    }
  }

  parseTimeframe(tf) {
    const unit = tf.slice(-1);
    const value = parseInt(tf.slice(0, -1));
    return unit === 'm' ? value * 60 * 1000 : value * 60 * 60 * 1000;
  }
}

export default DataAggregator;