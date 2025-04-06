// src/indicators/cvd.js
import chalk from 'chalk';
import config from '../src/config.js';

class CVD {
  constructor() {
    this.lastCvd = 0;
  }

  calculate(candles) {
    if (candles.length === 0) return 0;
    const latestCandle = candles[candles.length - 1];
    this.lastCvd = latestCandle.cvd;
    console.log(chalk.blue(`CVD (${config.anchorPeriod}) aggiornato: ${this.lastCvd.toFixed(2)}`));
    return this.lastCvd;
  }

  crossover(prevCvd, currentCvd) {
    return prevCvd < 0 && currentCvd >= 0;
  }

  crossunder(prevCvd, currentCvd) {
    return prevCvd >= 0 && currentCvd < 0;
  }
}

export default CVD;