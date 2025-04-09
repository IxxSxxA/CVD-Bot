// src/cvdStrategy.js
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import config from './config.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class CvdStrategy {
  constructor() {
    this.candles = new Map();
    this.currentCandle = new Map();
    this.fvgList = [];
    this.activeTrade = null;
    this.timeframeMs = this.getTimeframeMs(config.timeFrame);
    this.anchorPeriodMs = this.getTimeframeMs(config.anchorPeriod);
    this.lastCvd = 0; // Per tracciare il CVD precedente
    this.waitingForFvg = false; // Stato "Waiting For FVG"
    this.signalDirection = null; // "Bull" o "Bear"
  }

  getTimeframeMs(timeframe) {
    const minute = 60 * 1000;
    return timeframe === '1m' ? minute :
           timeframe === '3m' ? 3 * minute :
           timeframe === '5m' ? 5 * minute :
           timeframe === '15m' ? 15 * minute :
           timeframe === '1h' ? 60 * minute : minute;
  }

  async loadCandles() { /* invariato */ }

  async saveCandles(timeframe) { /* invariato */ }

  calculateATR(period, timeframe) { /* invariato */ }

  calculateCvdCross(cvd) {
    const prevCvd = this.lastCvd;
    this.lastCvd = cvd;
    return {
      crossover: prevCvd <= 0 && cvd > 0,
      crossunder: prevCvd >= 0 && cvd < 0,
    };
  }

  onWebSocketData(trade) {
    this.updateCandles(trade, config.timeFrame);
    this.updateCandles(trade, config.anchorPeriod);
    this.checkCvdSignal(trade);
    this.checkFvgEntry(trade);
    this.saveCandles(config.timeFrame);
    this.saveCandles(config.anchorPeriod);
  }

  updateCandles(trade, timeframe) { /* invariato */ }

  checkCvdSignal(trade) {
    const currentCandle = this.currentCandle.get(config.timeFrame);
    if (!currentCandle) return;

    const { crossover, crossunder } = this.calculateCvdCross(currentCandle.cvd);
    let bullishSignal = false;
    let bearishSignal = false;

    if (config.cvdSignalType === 'Advanced') {
      const isBullishCandle = currentCandle.close > currentCandle.open;
      bearishSignal = isBullishCandle && crossunder;
      bullishSignal = !isBullishCandle && crossover;
    } else { // 'Raw'
      bearishSignal = crossunder;
      bullishSignal = crossover;
    }

    if (bullishSignal && !this.waitingForFvg) {
      this.waitingForFvg = true;
      this.signalDirection = 'Bull';
      console.log(chalk.cyan(`Waiting For Bullish FVG @ ${trade.timestamp}`));
    } else if (bearishSignal && !this.waitingForFvg) {
      this.waitingForFvg = true;
      this.signalDirection = 'Bear';
      console.log(chalk.cyan(`Waiting For Bearish FVG @ ${trade.timestamp}`));
    }
  }

  checkFvgEntry(trade) {
    const candles = this.candles.get(config.timeFrame) || [];
    if (candles.length < 3 || !this.waitingForFvg) return;

    const lastCandle = candles[candles.length - 1];
    const secondLastCandle = candles[candles.length - 2];
    const thirdLastCandle = candles[candles.length - 3];

    const fvgUp = thirdLastCandle.low > secondLastCandle.high && lastCandle.low > secondLastCandle.high;
    const fvgDown = thirdLastCandle.high < secondLastCandle.low && lastCandle.high < secondLastCandle.low;
    const atr = this.calculateATR(config.fvgAtrPeriod, config.timeFrame);

    if (fvgUp && this.signalDirection === 'Bull' && !this.activeTrade) {
      const entryPrice = secondLastCandle.high;
      const slTarget = entryPrice - atr * config.fvgSensitivity;
      const tpTarget = entryPrice + atr * 2;

      this.activeTrade = {
        entryType: 'Long',
        entryPrice,
        slTarget,
        tpTarget,
        entryTime: trade.timestamp,
        logged: false,
      };
      this.fvgList.push({ type: 'FVG Up', price: entryPrice, timestamp: trade.timestamp });
      this.waitingForFvg = false; // Resetta dopo ingresso
    } else if (fvgDown && this.signalDirection === 'Bear' && !this.activeTrade) {
      const entryPrice = secondLastCandle.low;
      const slTarget = entryPrice + atr * config.fvgSensitivity;
      const tpTarget = entryPrice - atr * 2;

      this.activeTrade = {
        entryType: 'Short',
        entryPrice,
        slTarget,
        tpTarget,
        entryTime: trade.timestamp,
        logged: false,
      };
      this.fvgList.push({ type: 'FVG Down', price: entryPrice, timestamp: trade.timestamp });
      this.waitingForFvg = false; // Resetta dopo ingresso
    }

    if (this.activeTrade) {
      const currentPrice = trade.price;
      if (
        (this.activeTrade.entryType === 'Long' && (currentPrice <= this.activeTrade.slTarget || currentPrice >= this.activeTrade.tpTarget)) ||
        (this.activeTrade.entryType === 'Short' && (currentPrice >= this.activeTrade.slTarget || currentPrice <= this.activeTrade.tpTarget))
      ) {
        this.activeTrade = null;
      }
    }
  }
}

export default CvdStrategy;