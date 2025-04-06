// src/config.js
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const config = {
  // Exchange
  apiKey: process.env.BYBIT_API_KEY,
  apiSecret: process.env.BYBIT_API_SECRET,
  symbol: 'BTCUSDT',
  category: 'linear',
  testnet: false,

  // Strategia CVD
  timeFrame: '1m',          // TF candele principali (es. 3m dopo)
  anchorPeriod: '3m',       // TF per CVD (es. 15m dopo)
  entryMode: 'FVGs',        // Solo FVGs
  
  // FVG
  fvgSensitivity: 1.5,      // Sensibilità FVG (numerico, es. 1.5 per test)
  fvgAtrPeriod: 10,         // Periodo ATR per filtro FVG

  // CVD
  cvdAtrPeriod: 50,         // Periodo ATR per CVD (se serve)

  // Logging
  logSignals: true          // Log dinamici
};

export default config;