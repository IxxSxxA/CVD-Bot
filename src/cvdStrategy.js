// src/cvdStrategy.js
import config from './config.js';
import chalk from 'chalk';

class CvdStrategy {
  constructor(aggregator) {
    this.aggregator = aggregator; // Riferimento a DataAggregator
    this.candles = new Map([
      [config.timeFrame, []],    // Coppia [chiave, valore]
      [config.anchorPeriod, []]  // Coppia [chiave, valore]
    ]);
    this.currentCandle = null;
    this.activeTrade = null;
    this.timeframeMs = this.getTimeframeMs(config.timeFrame);
    this.anchorPeriodMs = this.getTimeframeMs(config.anchorPeriod);
    this.lastCVDSignal = null;
  }

  
  getTimeframeMs(timeframe) {
    const minute = 60 * 1000;
    return timeframe === '1m' ? minute :
           timeframe === '3m' ? 3 * minute :
           timeframe === '5m' ? 5 * minute :
           timeframe === '15m' ? 15 * minute :
           timeframe === '1h' ? 60 * minute : minute;
  }

  calculateATR(candles, period) {
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
    return trSum / period;
  }

  detectFVG(candles) {
    if (candles.length < config.minimumFvgSize + 1) return null;
    const current = candles[candles.length - 1];
    const prev1 = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    const atr = this.calculateATR(candles, config.fvgAtrPeriod);

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
    return fvg;
  }

  detectCVDSignal(anchorCandles) {
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
    return signal;
  }

  onWebSocketData(trade) {
    const tfCandles = this.candles.get(config.timeFrame);
    const anchorCandles = this.candles.get(config.anchorPeriod);

    // Aggiorna candela corrente
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

    // Aggiorna candele da DataAggregator (sincronizzazione)
    const aggregatorCandlesTf = this.candles.get(config.timeFrame);
    const aggregatorCandlesAp = this.candles.get(config.anchorPeriod);
    if (aggregatorCandlesTf.length > tfCandles.length) {
      this.candles.set(config.timeFrame, aggregatorCandlesTf.slice());
    }
    if (aggregatorCandlesAp.length > anchorCandles.length) {
      this.candles.set(config.anchorPeriod, aggregatorCandlesAp.slice());
    }

    // Rileva segnale CVD
    const cvdSignal = this.detectCVDSignal(anchorCandles);
    if (cvdSignal) this.lastCVDSignal = cvdSignal;

    // Rileva FVG
    const latestFVG = this.detectFVG(tfCandles.concat([this.currentCandle]));
    if (!this.activeTrade && this.lastCVDSignal && latestFVG) {
      this.processSignal(this.lastCVDSignal, latestFVG);
    }

    // Controlla TP/SL
    if (this.activeTrade) {
      this.checkTradeStatus();
    }
  }

  processSignal(cvdSignal, fvg) {
    if ((cvdSignal === 'Bull' && !fvg.isBull) || (cvdSignal === 'Bear' && fvg.isBull)) return;

    const tfCandles = this.candles.get(config.timeFrame);
    const atr = this.calculateATR(tfCandles, config.cvdAtrPeriod);
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