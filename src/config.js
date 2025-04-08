// src/config.js
import { config as dotenvConfig } from 'dotenv';

// dotenvConfig();

const config = {
  // Exchange Bybit
  // apiKey: process.env.BYBIT_API_KEY,
  // apiSecret: process.env.BYBIT_API_SECRET,
  symbol: 'BTCUSDT',
  category: 'linear',
  testnet: false,

  // Strategia CVD
  timeFrame: '3m',          // Timeframe candele principali
  anchorPeriod: '5m',       // Timeframe per CVD
  // entryMode: 'FVGs',        // Fisso su FVGs (non configurabile)

  // FVG
  fvgSensitivity: 1.5,      // Sensibilità FVG (numerico, sostituisce il testo)
  fvgAtrPeriod: 10,         // Periodo ATR per filtro FVG
  minimumFvgSize: 2,        // Dimensione minima FVG in barre

  // CVD
  cvdAtrPeriod: 50,         // Periodo ATR per CVD
  cvdSignalType: 'Raw',     // Tipo di segnale CVD ('Raw' o 'Advanced')

  // TP/SL (solo Dynamic)
  slAtrMultiplier: 6.5,     // Moltiplicatore ATR per Stop Loss
  tpRiskRewardRatio: 0.57,  // Rapporto Rischio:Rendimento per Take Profit

  // Logging
  logSignals: true          // Log dinamici
};

export default config;