// src/cvdStrategy.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import chalk from 'chalk';
import ATR from './indicators/atr.js';
import FVG from './indicators/fvg.js';
import CVD from './indicators/cvd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CvdStrategy {
  constructor() {
    this.candles = new Map([
      [config.timeFrame, []],
      [config.anchorPeriod, []]
    ]);
    this.currentCandle = null;
    this.activeTrade = null;
    this.timeframeMs = this.getTimeframeMs(config.timeFrame);
    this.anchorPeriodMs = this.getTimeframeMs(config.anchorPeriod);
    this.lastCVDSignal = null;
    this.atr = new ATR();
    this.fvg = new FVG();
    this.cvd = new CVD();
    this.loadCandles();
  }

  getTimeframeMs(timeframe) {
    const minute = 60 * 1000;
    return timeframe === '1m' ? minute :
           timeframe === '3m' ? 3 * minute :
           timeframe === '5m' ? 5 * minute :
           timeframe === '15m' ? 15 * minute :
           timeframe === '1h' ? 60 * minute : minute;
  }

  async loadCandles() {
    const loadFile = async (timeframe) => {
      const filePath = path.join(__dirname, '../data', `candles_${timeframe}.json`);
      try {
        const data = await fs.readFile(filePath, 'utf8');
        this.candles.set(timeframe, JSON.parse(data));
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(chalk.yellow(`File ${filePath} non trovato. Inizializzo vuoto...`));
          this.candles.set(timeframe, []);
        } else {
          console.error(chalk.red(`Errore nel caricare ${filePath}: ${error.message}`));
        }
      }
    };
    await loadFile(config.timeFrame);
    await loadFile(config.anchorPeriod);
  }

  onWebSocketData(trade) {
    const tfCandles = this.candles.get(config.timeFrame);
    const anchorCandles = this.candles.get(config.anchorPeriod);

    const timestamp = Math.floor(trade.timestamp / this.timeframeMs) * this.timeframeMs;
    if (!this.currentCandle || this.currentCandle.timestamp < timestamp) {
      if (this.currentCandle) tfCandles.push(this.currentCandle);
      this.currentCandle = {
        timestamp,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volumeBuy: 0,
        volumeSell: 0,
        cvd: tfCandles.length > 0 ? tfCandles[tfCandles.length - 1].cvd : 0
      };
    }
    this.currentCandle.high = Math.max(this.currentCandle.high, trade.price);
    this.currentCandle.low = Math.min(this.currentCandle.low, trade.price);
    this.currentCandle.close = trade.price;
    this.currentCandle.volumeBuy += trade.side === 'Buy' ? trade.volume : 0;
    this.currentCandle.volumeSell += trade.side === 'Sell' ? trade.volume : 0;
    this.currentCandle.cvd += (trade.side === 'Buy' ? trade.volume : 0) - (trade.side === 'Sell' ? trade.volume : 0);

    const cvdSignal = this.cvd.detect(anchorCandles);
    if (cvdSignal) this.lastCVDSignal = cvdSignal;

    const latestFVG = this.fvg.detect(tfCandles.concat([this.currentCandle]));
    if (!this.activeTrade && this.lastCVDSignal && latestFVG) {
      this.processSignal(this.lastCVDSignal, latestFVG);
    }

    if (this.activeTrade) this.checkTradeStatus();
  }

  processSignal(cvdSignal, fvg) {
    if ((cvdSignal === 'Bull' && !fvg.isBull) || (cvdSignal === 'Bear' && fvg.isBull)) return;

    const tfCandles = this.candles.get(config.timeFrame);
    const atr = this.atr.calculate(tfCandles, config.cvdAtrPeriod);
    const entryPrice = this.currentCandle.close;

    this.activeTrade = {
      entryType: cvdSignal === 'Bull' ? 'Long' : 'Short',
      entryTime: Date.now(),
      entryPrice,
      logged: false
    };

    if (this.activeTrade.entryType === 'Long') {
      this.activeTrade.slTarget = entryPrice - atr * config.slAtrMultiplier;
      this.activeTrade.tpTarget = entryPrice + (Math.abs(entryPrice - this.activeTrade.slTarget) * config.tpRiskRewardRatio);
    } else {
      this.activeTrade.slTarget = entryPrice + atr * config.slAtrMultiplier;
      this.activeTrade.tpTarget = entryPrice - (Math.abs(entryPrice - this.activeTrade.slTarget) * config.tpRiskRewardRatio);
    }
  }

  checkTradeStatus() {
    if (!this.currentCandle || !this.activeTrade) return;

    if (this.activeTrade.entryType === 'Long') {
      if (this.currentCandle.high >= this.activeTrade.tpTarget) {
        this.closeTrade('Take Profit', this.activeTrade.tpTarget);
      } else if (this.currentCandle.low <= this.activeTrade.slTarget) {
        this.closeTrade('Stop Loss', this.activeTrade.slTarget);
      }
    } else {
      if (this.currentCandle.low <= this.activeTrade.tpTarget) {
        this.closeTrade('Take Profit', this.activeTrade.tpTarget);
      } else if (this.currentCandle.high >= this.activeTrade.slTarget) {
        this.closeTrade('Stop Loss', this.activeTrade.slTarget);
      }
    }
  }

  closeTrade(result, exitPrice) {
    if (config.logSignals) {
      const logMessage = `${this.activeTrade.entryType} ${result} @ ${exitPrice} - Entry: ${this.activeTrade.entryPrice}`;
      console.log(chalk[result === 'Take Profit' ? 'blue' : 'red'](logMessage));
    }
    this.activeTrade = null;
    this.lastCVDSignal = null;
  }
}

export default CvdStrategy;