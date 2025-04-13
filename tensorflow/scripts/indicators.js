import chalk from 'chalk';

export function prepareFeatures(candles, params = {}) {
  console.log(chalk.cyan(`Candele ricevute per feature: ${candles.length}`));
  
  if (!Array.isArray(candles) || candles.length === 0) {
    console.log(chalk.yellow('Nessuna candela valida per calcolare feature'));
    return [];
  }
  
  const atrPeriod = params.atrPeriod || 14;
  const atr = [];
  const trs = [];
  
  const features = candles.map((candle, i) => {
    if (!candle || candle.close === null || candle.close === undefined) {
      return null;
    }
    
    const cvd = Number(candle.cvd) || 0;
    
    if (i === 0 || i === candles.length - 1) {
      console.log(chalk.cyan(`Candela ${i}: cvd=${cvd}`));
    }
    
    let tr = 0;
    if (i > 0) {
      const prev = candles[i - 1];
      tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - (prev.close || 0)),
        Math.abs(candle.low - (prev.close || 0))
      );
      trs.push(tr);
      
      if (trs.length >= atrPeriod) {
        const avgTR = trs.slice(-atrPeriod).reduce((sum, val) => sum + val, 0) / atrPeriod;
        atr[i] = avgTR;
      } else {
        atr[i] = 0;
      }
    } else {
      trs.push(candle.high - candle.low);
      atr[i] = 0;
    }
    
    const fvgBull = i >= 2 && candle.low > candles[i - 2].high;
    const fvgBear = i >= 2 && candle.high < candles[i - 2].low;
    
    return {
      ...candle,
      cvd,
      cvdCumulative: cvd, // Per model.js
      atr: atr[i],
      fvgBull,
      fvgBear
    };
  }).filter(c => c !== null);
  
  console.log(chalk.cyan(`Feature preparate: ${features.length}`));
  return features;
}