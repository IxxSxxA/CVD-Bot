// src/exchanges/binance.js
import WebSocket from 'ws';
import chalk from 'chalk';
import config from '../config.js';

class BinanceExchange {
  constructor() {
    this.ws = null;
    this.symbol = config.symbol.toLowerCase().replace('usdt', ''); // Es. BTCUSDT -> btc
    this.onTradeCallback = null; // Callback per passare i trade a bot.js
  }

  async initialize() {
    console.log(chalk.blue('Inizializzazione Binance Spot WebSocket...'));
    this.connectWebSocket();
  }

  connectWebSocket() {
    const wsUrl = `wss://stream.binance.com:9443/ws/${this.symbol}usdt@trade`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log(chalk.green('Connessione WebSocket Binance Spot aperta'));
    });

    this.ws.on('message', (data) => {
      const trade = JSON.parse(data);
      this.handleTrade(trade);
    });

    this.ws.on('error', (error) => {
      console.error(chalk.red(`Errore WebSocket Binance: ${error.message}`));
    });

    this.ws.on('close', () => {
      console.log(chalk.yellow('Connessione WebSocket Binance chiusa'));
      setTimeout(() => this.connectWebSocket(), 5000); // Riconnessione
    });
  }

  handleTrade(trade) {
    const processedTrade = {
      symbol: trade.s, // Es. BTCUSDT
      side: trade.m ? 'Sell' : 'Buy', // m = maker (true = sell, false = buy)
      volume: parseFloat(trade.q), // Quantità
      price: parseFloat(trade.p), // Prezzo
      timestamp: trade.T // Timestamp in ms
    };
    if (this.onTradeCallback) {
      this.onTradeCallback(processedTrade); // Passo il trade al callback
    }
  }

  onTrade(callback) {
    this.onTradeCallback = callback; // Metodo per registrare il callback
  }

  async disconnectWebSocket() {
    if (this.ws) {
      this.ws.close();
      console.log(chalk.cyan('WebSocket Binance Spot disconnesso'));
    }
  }
}

export default BinanceExchange;