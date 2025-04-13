import { readFile } from 'fs/promises';

async function checkCVD() {
  try {
    const data = await readFile('../data/candles_1m.json', 'utf8');
    const candles = JSON.parse(data);
    let cvdCumulative = 0;
    candles.forEach((candle, i) => {
      const volumeBuy = Number(candle.volumeBuy) || 0;
      const volumeSell = Number(candle.volumeSell) || 0;
      const cvd = volumeBuy - volumeSell;
      cvdCumulative += cvd;
      if (i < 5 || i >= candles.length - 5) {
        console.log(`Candela ${i}: volumeBuy=${volumeBuy}, volumeSell=${volumeSell}, cvd=${cvd}`);
      }
    });
    console.log(`CVD totale: ${cvdCumulative.toFixed(2)}`);
  } catch (e) {
    console.error(`Errore: ${e.message}`);
  }
}

checkCVD();