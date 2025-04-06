// src/dataAggregator.js
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import config from './config.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DataAggregator {
  constructor() {
    this.trades = [];
    this.candles = new Map();
    this.currentCandles = new Map(); // Candele in corso
    this.tradeCount = 0;
    this.startTime = Date.now();
    this.timeframeMs = this.getTimeframeMs(config.timeFrame);
    this.anchorPeriodMs = this.getTimeframeMs(config.anchorPeriod);
    console.log(chalk.green(`Bot partito alle ${new Date(this.startTime).toLocaleTimeString()}`));
    this.startPeriodicSave();
  }

  getTimeframeMs(timeframe) {
    const minute = 60 * 1000;
    return timeframe === '1m' ? minute :
           timeframe === '3m' ? 3 * minute :
           timeframe === '5m' ? 5 * minute :
           timeframe === '15m' ? 15 * minute :
           timeframe === '1h' ? 60 * minute : minute;
  }

  processTrade(trade) {
    if (!trade.timestamp || isNaN(trade.timestamp)) {
      console.log(chalk.red(`Trade con timestamp invalido: ${JSON.stringify(trade)}`));
      return;
    }
    this.trades.push(trade);
    this.tradeCount++;
    console.log(chalk.cyan(`Trade aggregato: ${JSON.stringify(trade)}`));
    this.aggregateCandle(trade, config.timeFrame);
    this.aggregateCandle(trade, config.anchorPeriod);

    const tfCandles = this.candles.get(config.timeFrame) || [];
    const apCandles = this.candles.get(config.anchorPeriod) || [];
    const now = Date.now();
    const elapsedMs = now - this.startTime;
    const tfExpected = Math.floor(elapsedMs / this.timeframeMs);
    const apExpected = Math.floor(elapsedMs / this.anchorPeriodMs);
    const tfStatus = tfCandles.length >= tfExpected ? 'OK' : 'ERRORE';
    const apStatus = apCandles.length >= apExpected ? 'OK' : 'ERRORE';

    console.log(chalk.gray(
      `${new Date(now).toLocaleTimeString()} - ` +
      `Trades ricevuti: ${this.tradeCount}, ` +
      `Candele ${config.timeFrame}: ${tfCandles.length}/${tfExpected} (${tfStatus}), ` +
      `Candele ${config.anchorPeriod}: ${apCandles.length}/${apExpected} (${apStatus})`
    ));
  }

  aggregateCandle(trade, timeframe) {
    const interval = timeframe === config.timeFrame ? this.timeframeMs : this.anchorPeriodMs;
    const timestamp = Math.floor(trade.timestamp / interval) * interval;

    if (!this.candles.has(timeframe)) {
      this.candles.set(timeframe, []);
    }
    if (!this.currentCandles.has(timeframe)) {
      this.currentCandles.set(timeframe, null);
    }

    let candles = this.candles.get(timeframe);
    let currentCandle = this.currentCandles.get(timeframe);

    // Se la candela corrente è di un timestamp precedente, chiudila
    if (currentCandle && currentCandle.timestamp < timestamp) {
      candles.push(currentCandle);
      currentCandle = null;
    }

    // Crea o aggiorna la candela corrente
    if (!currentCandle) {
      currentCandle = {
        timestamp,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volumeBuy: 0,
        volumeSell: 0,
        cvd: 0,
      };
      this.currentCandles.set(timeframe, currentCandle);
    } else {
      currentCandle.high = Math.max(currentCandle.high, trade.price);
      currentCandle.low = Math.min(currentCandle.low, trade.price);
      currentCandle.close = trade.price;
    }

    if (trade.side === 'Buy') {
      currentCandle.volumeBuy += trade.volume || 0;
    } else {
      currentCandle.volumeSell += trade.volume || 0;
    }
    currentCandle.cvd = currentCandle.volumeBuy - currentCandle.volumeSell;

    const prevCandleIndex = candles.length - 1;
    if (prevCandleIndex >= 0) {
      currentCandle.cvd += candles[prevCandleIndex].cvd;
    }
  }

  async saveCandlesToFile(timeframe) {
    const filePath = path.join(__dirname, '../data', `candles_${timeframe}.json`);
    const closedCandles = this.candles.get(timeframe) || [];
    let existingCandles = [];
    try {
      const data = await fs.readFile(filePath, 'utf8');
      existingCandles = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(chalk.red(`Errore nella lettura di ${filePath}: ${error.message}`));
      }
    }

    const combinedCandles = [...existingCandles];
    closedCandles.forEach(newCandle => {
      const existingIndex = combinedCandles.findIndex(c => c.timestamp === newCandle.timestamp);
      if (existingIndex === -1) {
        combinedCandles.push(newCandle);
      } else {
        combinedCandles[existingIndex] = newCandle;
      }
    });

    try {
      await fs.writeFile(filePath, JSON.stringify(combinedCandles, null, 2));
      console.log(chalk.gray(`Candele salvate in ${filePath} (${combinedCandles.length} totali)`));
    } catch (error) {
      console.error(chalk.red(`Errore nel salvare ${filePath}: ${error.message}`));
    }
  }

  startPeriodicSave() {
    setInterval(() => {
      this.saveCandlesToFile(config.timeFrame);
      this.saveCandlesToFile(config.anchorPeriod);
    }, 60 * 1000);
  }

  getAggregatedData(timeframe) {
    return this.candles.get(timeframe) || [];
  }
}

export default DataAggregator;