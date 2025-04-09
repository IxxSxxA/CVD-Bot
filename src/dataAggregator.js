// src/dataAggregator.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import chalk from 'chalk';
import CurrentCandleManager from './currentCandleManager.js'; // Nuova importazione

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DataAggregator {
  constructor() {
    this.candles = new Map();
    this.tradesReceived = 0;
    this.currentCandleManager = new CurrentCandleManager(); // Nuova istanza
    this.initialize();
  }

  initialize() {
    const timeframes = [config.timeFrame, config.anchorPeriod];
    timeframes.forEach((tf) => {
      this.candles.set(tf, []);
    });
    this.tradeCountLog();
  }

  tradeCountLog() {
    setInterval(() => {
      const tfCandles = this.candles.get(config.timeFrame);
      const apCandles = this.candles.get(config.anchorPeriod);
      console.log(chalk.gray(
        `${new Date().toLocaleTimeString()} - Trades ricevuti: ${this.tradesReceived}, ` +
        `Candele ${config.timeFrame}: ${tfCandles.length}/${tfCandles.length} (OK), ` +
        `Candele ${config.anchorPeriod}: ${apCandles.length}/${apCandles.length} (OK)`
      ));
    }, 10000);
  }

  async saveCandles(timeframe, candles) {
    try {
      const filePath = path.join(__dirname, '../data', `candles_${timeframe}.json`);
      await fs.writeFile(filePath, JSON.stringify(candles));
    } catch (error) {
      console.error(chalk.red(`Errore nel salvare candele ${timeframe}: ${error.message}`));
    }
  }

  getAggregatedData(timeframe) {
    return this.candles.get(timeframe) || [];
  }

  processTrade(trade) {
    console.log(chalk.gray(`Trade aggregato: ${JSON.stringify(trade)}`));
    this.tradesReceived++;

    const timeframes = [
      { name: config.timeFrame, ms: this.getTimeframeMs(config.timeFrame) },
      { name: config.anchorPeriod, ms: this.getTimeframeMs(config.anchorPeriod) }
    ];

    timeframes.forEach(({ name, ms }) => {
      const candles = this.candles.get(name);
      const timestamp = Math.floor(trade.timestamp / ms) * ms;

      let lastCandle = candles[candles.length - 1];

      if (!lastCandle || lastCandle.timestamp < timestamp) {
        lastCandle = {
          timestamp,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volumeBuy: 0,
          volumeSell: 0,
          cvd: candles.length > 0 ? candles[candles.length - 1].cvd : 0
        };
        candles.push(lastCandle);
      }

      lastCandle.high = Math.max(lastCandle.high, trade.price);
      lastCandle.low = Math.min(lastCandle.low, trade.price);
      lastCandle.close = trade.price;
      lastCandle.volumeBuy += trade.side === 'Buy' ? trade.volume : 0;
      lastCandle.volumeSell += trade.side === 'Sell' ? trade.volume : 0;
      lastCandle.cvd += (trade.side === 'Buy' ? trade.volume : 0) - (trade.side === 'Sell' ? trade.volume : 0);

      this.saveCandles(name, candles);
    });

    // Aggiunta: aggiorna la candela corrente solo per config.timeFrame
    this.currentCandleManager.updateCurrentCandle(trade);
  }

  getTimeframeMs(timeframe) {
    const minute = 60 * 1000;
    return timeframe === '1m' ? minute :
           timeframe === '3m' ? 3 * minute :
           timeframe === '5m' ? 5 * minute :
           timeframe === '15m' ? 15 * minute :
           timeframe === '1h' ? 60 * minute : minute;
  }
}

export default DataAggregator;