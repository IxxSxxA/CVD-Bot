// src/exchanges/bybit.js
import WebSocket from 'ws';
import chalk from 'chalk';
import DataAggregator from '../dataAggregator.js';
import config from '../config.js';

class BybitExchange {
  constructor() {
    this.ws = null;
    this.apiKey = process.env.BYBIT_API_KEY;
    this.apiSecret = process.env.BYBIT_API_SECRET;
    this.baseWsUrl = 'wss://stream.bybit.com/v5/public/linear';
    this.baseRestUrl = config.testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
    this.connected = false;
    this.dataAggregator = new DataAggregator();
  }

  normalizeTrade(rawTrade) {
    return {
      symbol: rawTrade.s || rawTrade.symbol,
      side: rawTrade.S || rawTrade.side,
      volume: parseFloat(rawTrade.v || rawTrade.qty || rawTrade.size || 0),
      price: parseFloat(rawTrade.p || rawTrade.price),
      timestamp: rawTrade.T || rawTrade.trade_time_ms || rawTrade.time,
    };
  }

  async initialize() {
    await this.connectWebSocket();
  }

  async connectWebSocket() {
    if (this.connected) {
      console.log(chalk.yellow('WebSocket Bybit già connesso.'));
      return;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.baseWsUrl);

      this.ws.on('open', () => {
        this.connected = true;
        console.log(chalk.green('Connesso al WebSocket di Bybit'));
        this.subscribeToTrades(config.symbol);
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      });

      this.ws.on('error', (error) => {
        console.error(chalk.red(`Errore WebSocket Bybit: ${error.message}`));
        this.connected = false;
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(chalk.yellow('Connessione WebSocket Bybit chiusa'));
        this.connected = false;
      });
    });
  }

  subscribeToTrades(symbol) {
    const subscription = {
      op: 'subscribe',
      args: [`publicTrade.${symbol}`],
    };
    console.log(chalk.cyan(`Invio sottoscrizione: ${JSON.stringify(subscription)}`));
    this.ws.send(JSON.stringify(subscription));
  }

  handleWebSocketMessage(message) {
    if (message.success === false) {
      console.error(chalk.red('Errore sottoscrizione:'), message.ret_msg);
    } else if (message.topic && message.topic.startsWith('publicTrade')) {
      const tradeData = message.data[0];
      const trade = this.normalizeTrade(tradeData);
      console.log(chalk.gray(`Trade ricevuto: ${JSON.stringify(trade)}`));
      this.dataAggregator.processTrade(trade);
    } else {
      console.log(chalk.gray('Messaggio ricevuto da Bybit:'), message);
    }
  }

  async disconnectWebSocket() {
    if (this.ws && this.connected) {
      this.ws.close();
      this.connected = false;
    }
  }
}

export default BybitExchange;