// src/cvdStrategy.js
import chalk from 'chalk';
import config from './config.js';

class CVDS {
  constructor(dataAggregator) {
    this.dataAggregator = dataAggregator;
    this.state = 'Waiting For CVDS';
    this.cvdSignal = null; // 'Bull' o 'Bear'
    this.entryTime = null;
    this.entryPrice = null;
    this.lastCvd = null; // Per crossover/crossunder
    this.fvgs = []; // Lista FVG attivi
    this.signals = []; // Per chart futura: { type: 'Buy'/'Sell', timestamp, price }
  }

  // Calcola ATR su un periodo dato
  calculateATR(candles, period) {
    if (candles.length < period) return 0;
    let trSum = 0;
    for (let i = 0; i < period; i++) {
      const candle = candles[candles.length - 1 - i];
      const prevCandle = i > 0 ? candles[candles.length - 2 - i] : null;
      const highLow = candle.high - candle.low;
      const highPrevClose = prevCandle ? Math.abs(candle.high - prevCandle.close) : 0;
      const lowPrevClose = prevCandle ? Math.abs(candle.low - prevCandle.close) : 0;
      const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);
      trSum += trueRange;
    }
    return trSum / period;
  }

  // Rileva FVG su candele timeFrame
  detectFVG(candles) {
    if (candles.length < 3) return null;
    const atr = this.calculateATR(candles, config.fvgAtrPeriod);
    const current = candles[candles.length - 1];
    const prev1 = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    // Bullish FVG
    if (current.low > prev2.high && prev1.close > prev2.high) {
      const fvgSize = current.low - prev2.high;
      if (fvgSize * config.fvgSensitivity > atr) {
        return {
          type: 'Bullish',
          top: current.low,
          bottom: prev2.high,
          startTime: current.timestamp,
          endTime: null
        };
      }
    }

    // Bearish FVG
    if (current.high < prev2.low && prev1.close < prev2.low) {
      const fvgSize = prev2.low - current.high;
      if (fvgSize * config.fvgSensitivity > atr) {
        return {
          type: 'Bearish',
          top: prev2.low,
          bottom: current.high,
          startTime: current.timestamp,
          endTime: null
        };
      }
    }
    return null;
  }

  // Processa strategia su candele aggiornate
  process() {
    const anchorCandles = this.dataAggregator.getAggregatedData(config.anchorPeriod);
    const tfCandles = this.dataAggregator.getAggregatedData(config.timeFrame);

    if (anchorCandles.length < 2 || tfCandles.length < 3) return;

    // Calcolo CVD
    const currentCvd = anchorCandles[anchorCandles.length - 1].cvd;
    const prevCvd = anchorCandles[anchorCandles.length - 2].cvd;

    // Segnali CVD
    if (this.lastCvd !== null) {
      if (this.lastCvd < 0 && currentCvd >= 0) {
        this.cvdSignal = 'Bull';
      } else if (this.lastCvd > 0 && currentCvd <= 0) {
        this.cvdSignal = 'Bear';
      }
    }
    this.lastCvd = currentCvd;

    // Stato macchina
    switch (this.state) {
      case 'Waiting For CVDS':
        if (this.cvdSignal) {
          this.state = 'Waiting For FVG';
          if (config.logSignals) {
            console.log(chalk.yellow(
              `Waiting For ${this.cvdSignal === 'Bull' ? 'Bullish' : 'Bearish'} FVG @ ${new Date(anchorCandles[anchorCandles.length - 1].timestamp).toISOString()}`
            ));
          }
        }
        break;

        case 'Waiting For FVG':
          const newFvg = this.detectFVG(tfCandles);
          if (newFvg) {
            this.fvgs.push(newFvg);
            if (
              (this.cvdSignal === 'Bull' && newFvg.type === 'Bullish') ||
              (this.cvdSignal === 'Bear' && newFvg.type === 'Bearish')
            ) {
              this.state = 'Enter Position';
              this.entryTime = tfCandles[tfCandles.length - 1].timestamp;
              this.entryPrice = tfCandles[tfCandles.length - 1].close;
              const signalType = this.cvdSignal === 'Bull' ? 'Buy' : 'Sell';
              this.signals.push({
                type: signalType,
                timestamp: this.entryTime,
                price: this.entryPrice
              });
              if (config.logSignals) {
                console.log(chalk.green(
                  `${signalType} Signal @ ${new Date(this.entryTime).toISOString()} - Price: ${this.entryPrice}`
                ));
              }
              this.state = 'Waiting For CVDS';
              this.cvdSignal = null;
            }
          }
          break;
        }

    // Invalidazione FVG (opzionale, per log/chart futura)
    this.fvgs = this.fvgs.filter(fvg => {
      const lastCandle = tfCandles[tfCandles.length - 1];
      if (fvg.endTime) return false;
      if (fvg.type === 'Bullish' && lastCandle.low < fvg.bottom) {
        fvg.endTime = lastCandle.timestamp;
        return false;
      }
      if (fvg.type === 'Bearish' && lastCandle.high > fvg.top) {
        fvg.endTime = lastCandle.timestamp;
        return false;
      }
      return true;
    });
  }

  // Getter per segnali (per chart futura)
  getSignals() {
    return this.signals;
  }
}

export default CVDS;