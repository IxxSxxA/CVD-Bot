import chalk from 'chalk';
import { TradingStrategy } from './strategy.js';
import { prepareFeatures } from './indicators.js';

export class ParameterOptimizer {
  constructor() {
    this.paramRanges = {
      atrMultiplierSl: [0.5, 1, 1.5, 2],
      atrMultiplierTp: [1, 2, 3, 4],
      cvdThreshold: [0.1, 0.2, 0.3, 0.5],
      fvgMinGapFactor: [0.05, 0.1, 0.2]
    };
  }

  async optimize(candles, model) {
    console.log(chalk.cyan(`Ottimizzazione con ${candles.length} candele`));
    let bestParams = null;
    let bestScore = -Infinity;
    
    const features = prepareFeatures(candles);
    
    for (const atrSl of this.paramRanges.atrMultiplierSl) {
      for (const atrTp of this.paramRanges.atrMultiplierTp) {
        for (const cvdThresh of this.paramRanges.cvdThreshold) {
          for (const fvgGap of this.paramRanges.fvgMinGapFactor) {
            const params = {
              atrMultiplierSl: atrSl,
              atrMultiplierTp: atrTp,
              cvdThreshold: cvdThresh,
              fvgMinGapFactor: fvgGap
            };
            
            const strategy = new TradingStrategy(params);
            const modelSignal = await model.predict(features);
            const tradeSignal = strategy.generateSignal(features, modelSignal);
            strategy.applyTrade(features, tradeSignal);
            
            const score = strategy.evaluate();
            console.log(chalk.cyan(`Test parametri: ${JSON.stringify(params)}, Score: ${score}`));
            if (score > bestScore) {
              bestScore = score;
              bestParams = params;
            }
          }
        }
      }
    }
    
    console.log(chalk.cyan(`Migliori parametri: ${JSON.stringify(bestParams)}, Score: ${bestScore}`));
    return bestParams || {
      atrMultiplierSl: 1,
      atrMultiplierTp: 2,
      cvdThreshold: 0.1,
      fvgMinGapFactor: 0.05
    };
  }
}