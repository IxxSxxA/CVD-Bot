// src/indicators/atr.js
import chalk from 'chalk';
import config from '../src/config.js';

class ATR {
  constructor(length = 10) {
    this.length = length;
  }

  calculate(candles) {
    if (candles.length < 2) return 0;

    const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      const trValue = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      tr.push(trValue);
    }

    if (tr.length < this.length) return 0;
    const atr = tr.slice(-this.length).reduce((sum, val) => sum + val, 0) / this.length;
    console.log(chalk.blue(`ATR (${config.timeFrame}, ${this.length}): ${atr.toFixed(2)}`));
    return atr;
  }
}

export default ATR;