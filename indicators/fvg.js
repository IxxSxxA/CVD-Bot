// src/indicators/fvg.js
import chalk from 'chalk';
import config from '../src/config.js';

class FVG {
  constructor() {
    this.sensitivityMultiplier = config.fvgSensitivity === 'High' ? 2 : config.fvgSensitivity === 'Normal' ? 1.5 : 1;
  }

  calculate(candles, atr) {
    if (candles.length < 3) return [];

    console.log(chalk.gray(`Calcolo FVG con ${candles.length} candele, ATR=${atr.toFixed(2)}`));


    const fvgs = [];
    for (let i = 2; i < candles.length; i++) {
      const curr = candles[i];
      const prev1 = candles[i - 1];
      const prev2 = candles[i - 2];

      const barSizeSum = (curr.high - curr.low) + (prev1.high - prev1.low) + (prev2.high - prev2.low);
      if (barSizeSum * this.sensitivityMultiplier <= atr / 1.5) continue;

      // Bullish FVG: low > high[2]
      if (curr.low > prev2.high) {
        const fvg = {
          type: 'Bullish',
          top: curr.low,
          bottom: prev2.high,
          startTime: curr.timestamp,
          endTime: null,
        };
        fvgs.push(fvg);
        console.log(chalk.green(`Bullish FVG (${config.timeFrame}) rilevato: ${JSON.stringify(fvg)}`));
      }
      // Bearish FVG: high < low[2]
      else if (curr.high < prev2.low) {
        const fvg = {
          type: 'Bearish',
          top: prev2.low,
          bottom: curr.high,
          startTime: curr.timestamp,
          endTime: null,
        };
        fvgs.push(fvg);
        console.log(chalk.red(`Bearish FVG (${config.timeFrame}) rilevato: ${JSON.stringify(fvg)}`));
      }
    }
    return fvgs;
  }
}

export default FVG;