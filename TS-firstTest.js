import fs from 'fs';
import fsPromises from 'fs/promises';
import tf from '@tensorflow/tfjs-node';
import config from './src/config.js';
import ATR from './src/indicators/atr.js';

const timeFrame = config.timeFrame;
const candleFile = `data/candles_${timeFrame}.json`;
const logFile = `data/ts_log.txt`;

const timeFrameToMs = {
  '1m': 1 * 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000
};
const timeFrameMs = timeFrameToMs[timeFrame] || (3 * 60 * 1000);

const atrIndicator = new ATR();
const model = tf.sequential();
model.add(tf.layers.dense({ units: 32, inputShape: [6], activation: 'relu' }));
model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });

let candles = [];
const windowSize = 20;
let lastCheckTime = 0;
let openPosition = null;
const maxTradeCandles = 10;
const strategyName = 'Trend Following ATR';
const strategyParams = {
  windowSize: 20,
  atrPeriod: 14,
  tpMultiplier: 1.5,
  slMultiplier: 1.0,
  epochs: 20
};
let lastTrainingTime = 0;

function normalize(value, min, max) {
  return Math.max(-1, Math.min(1, (value - min) / (max - min)));
}

function getFeatures(candle, prevCandle) {
  const priceChange = (candle.close - candle.open) / candle.open;
  const cvd = candle.cvd;
  const range = candle.high - candle.low;
  const momentum = prevCandle ? candle.close - prevCandle.close : 0;
  const buyPressure = candle.volumeBuy / (candle.volumeBuy + candle.volumeSell || 1);
  const sellPressure = candle.volumeSell / (candle.volumeBuy + candle.volumeSell || 1);
  return [
    normalize(priceChange, -0.02, 0.02),
    normalize(cvd, -500, 500),
    normalize(range, 0, 500),
    normalize(momentum, -500, 500),
    buyPressure,
    sellPressure
  ];
}

function log(message, force = false) {
  const now = Date.now();
  if (force || now - lastCheckTime >= 10000) {
    console.log(message);
    fs.appendFileSync(logFile, `${message}\n`);
    lastCheckTime = now;
  }
}

async function readJson(file) {
  try {
    const data = await fsPromises.readFile(file, 'utf8');
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    log(`[${new Date().toLocaleTimeString()}] Errore lettura ${file}: ${err.message}`);
    return null;
  }
}

const header = `=== Run ${new Date().toISOString()} | TimeFrame: ${timeFrame} | WindowSize: ${windowSize} | Strategia: ${strategyName} ===`;
log(header, true);

setInterval(async () => {
  const now = Date.now();
  if (now - lastCheckTime < timeFrameMs) return;

  const aggregatedData = await readJson(candleFile);
  if (!aggregatedData || aggregatedData.length < windowSize) {
    log(`[${new Date().toLocaleTimeString()}] Aspetto più candele... (${aggregatedData ? aggregatedData.length : 0}/${windowSize})`);
    lastCheckTime = now;
    return;
  }

  candles = aggregatedData.slice(-windowSize);
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  const candleIndex = aggregatedData.length - 1;

  if (openPosition) {
    const { high, low, close } = lastCandle;
    let closed = false;
    let result = '';
    let exitPrice = close;

    if (openPosition.direction === 'Compra') {
      if (high >= openPosition.tp) {
        closed = true;
        result = 'TP hit';
        exitPrice = openPosition.tp;
      } else if (low <= openPosition.sl) {
        closed = true;
        result = 'SL hit';
        exitPrice = openPosition.sl;
      }
    } else {
      if (low <= openPosition.tp) {
        closed = true;
        result = 'TP hit';
        exitPrice = openPosition.tp;
      } else if (high >= openPosition.sl) {
        closed = true;
        result = 'SL hit';
        exitPrice = openPosition.sl;
      }
    }

    if (!closed && candleIndex >= openPosition.candleIndex + maxTradeCandles) {
      closed = true;
      result = 'Timeout';
      exitPrice = close;
    }

    if (closed) {
      log(`[${new Date(lastCandle.timestamp).toLocaleTimeString()}] Posizione chiusa: ${openPosition.direction} a ${openPosition.price.toFixed(2)} - ${result} a ${exitPrice.toFixed(2)}`);
      openPosition = null;
    }
  }

  if (!openPosition) {
    const features = getFeatures(lastCandle, prevCandle);

    try {
      if (Math.random() < 0.3) {
        const xs = tf.tensor2d(candles.slice(0, -1).map((c, i) => getFeatures(c, i > 0 ? candles[i - 1] : null)));
        const ys = tf.tensor2d(candles.slice(0, -1).map((c, i) => {
          const atr = atrIndicator.calculate(candles.slice(0, i + 1), 14);
          const price = c.close;
          const tp = c.close > candles[i].close ? price + atr * 1.5 : price - atr * 1.5;
          const sl = c.close > candles[i].close ? price - atr : price + atr;
          for (let j = i + 1; j < Math.min(candles.length, i + maxTradeCandles + 1); j++) {
            const futureCandle = candles[j];
            if (c.close > candles[i].close) {
              if (futureCandle.high >= tp) return [1];
              if (futureCandle.low <= sl) return [0];
            } else {
              if (futureCandle.low <= tp) return [1];
              if (futureCandle.high >= sl) return [0];
            }
          }
          return [0];
        }));
        await model.fit(xs, ys, { epochs: strategyParams.epochs, verbose: 0 });
        lastTrainingTime = lastCandle.timestamp;
        log(`[${new Date(lastCandle.timestamp).toLocaleTimeString()}] Modello allenato su ${windowSize} candele`, true);
      }

      const input = tf.tensor2d([features]);
      const prediction = model.predict(input).dataSync()[0];
      const direction = prediction > 0.5 ? 'Compra' : 'Vendi';
      const cvdSignal = lastCandle.cvd > 0 ? 'Compra' : 'Vendi';

      const atr = atrIndicator.calculate(candles, strategyParams.atrPeriod);
      const price = lastCandle.close;
      let tp, sl;
      if (direction === 'Compra') {
        tp = price + atr * strategyParams.tpMultiplier;
        sl = price - atr * strategyParams.slMultiplier;
      } else {
        tp = price - atr * strategyParams.tpMultiplier;
        sl = price + atr * strategyParams.slMultiplier;
      }

      openPosition = { direction, price, tp, sl, openTime: lastCandle.timestamp, candleIndex };

      const message = `[${new Date(lastCandle.timestamp).toLocaleTimeString()}] ${direction} (Prob: ${prediction.toFixed(2)}, Prezzo: ${price.toFixed(2)}, TP: ${tp.toFixed(2)}, SL: ${sl.toFixed(2)}, ATR: ${atr.toFixed(2)}, CVD: ${lastCandle.cvd.toFixed(2)}, CVD dice: ${cvdSignal}, Strategia: ${strategyName}, Parametri: Window=${strategyParams.windowSize}, ATR_Period=${strategyParams.atrPeriod}, TP=${strategyParams.tpMultiplier}*ATR, SL=${strategyParams.slMultiplier}*ATR, Training: ${lastTrainingTime ? new Date(lastTrainingTime).toLocaleTimeString() : 'Non ancora'})`;
      log(message, true);
    } catch (err) {
      log(`[${new Date(lastCandle.timestamp).toLocaleTimeString()}] Errore: ${err.message}`);
    }
  }

  lastCheckTime = now;
}, 1000);