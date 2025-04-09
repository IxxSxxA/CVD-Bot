// src/bot.js
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import readline from 'readline';
import config from './config.js';
import CvdStrategy from './cvdStrategy.js';
import DataAggregator from './dataAggregator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// File di log per i segnali
const signalsLogPath = path.join(__dirname, '../data/signals.log');

// Funzione per appendere al file di log
async function appendToLog(message) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    await fs.appendFile(signalsLogPath, logEntry, { flag: 'a' });
  } catch (error) {
    console.error(chalk.red(`Errore scrittura log segnali: ${error.message}`));
  }
}

// Funzione per verificare i parametri di configurazione
function verifyConfig(config) {
  const requiredParams = {
    symbol: 'string',
    category: ['linear', 'spot', 'inverse'],
    testnet: [true, false],
    timeFrame: ['1m', '3m', '5m', '15m', '1h'],
    anchorPeriod: ['1m', '3m', '5m', '15m', '1h'],
    fvgSensitivity: 'number',
    fvgAtrPeriod: 'number',
    cvdAtrPeriod: 'number',
    logSignals: [true, false]
  };

  for (const [key, constraint] of Object.entries(requiredParams)) {
    if (config[key] === undefined || config[key] === null) {
      throw new Error(`Parametro '${key}' mancante in config.js`);
    }
    if (Array.isArray(constraint)) {
      if (!constraint.includes(config[key])) {
        throw new Error(`Valore non valido per '${key}': ${config[key]}. Valori validi: ${constraint.join(', ')}`);
      }
    } else if (constraint === 'string' && (!config[key] || typeof config[key] !== 'string')) {
      throw new Error(`Parametro '${key}' deve essere una stringa non vuota`);
    } else if (constraint === 'number' && typeof config[key] !== 'number') {
      throw new Error(`Parametro '${key}' deve essere un numero`);
    }
  }

  console.log(chalk.blue('Parametri di configurazione verificati:'));
  console.log(chalk.gray(`- Symbol: ${config.symbol}`));
  console.log(chalk.gray(`- Category: ${config.category}`));
  console.log(chalk.gray(`- Testnet: ${config.testnet}`));
  console.log(chalk.gray(`- Timeframe grafico: ${config.timeFrame}`));
  console.log(chalk.gray(`- Anchor Period: ${config.anchorPeriod}`));
  console.log(chalk.gray(`- FVG Sensitivity: ${config.fvgSensitivity}`));
  console.log(chalk.gray(`- FVG ATR Period: ${config.fvgAtrPeriod}`));
  console.log(chalk.gray(`- CVD ATR Period: ${config.cvdAtrPeriod}`));
  console.log(chalk.gray(`- Log Signals: ${config.logSignals}`));
}

// Funzione per attendere l'input dell'utente
function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(chalk.yellow('Press Enter to continue...\n'), () => {
      rl.close();
      resolve();
    });
  });
}

class TradingBot {
  constructor() {
    this.exchanges = new Map();
    this.strategies = new Map();
    this.running = false;
    this.aggregator = new DataAggregator(); // Istanza unica di DataAggregator
  }

  async resetDataFolder() {
    const dataDir = path.join(__dirname, '../data');
    try {
      await fs.rm(dataDir, { recursive: true, force: true });
      await fs.mkdir(dataDir, { recursive: true });
      const timeframes = [config.timeFrame, config.anchorPeriod];
      for (const timeframe of timeframes) {
        const filePath = path.join(dataDir, `candles_${timeframe}.json`);
        await fs.writeFile(filePath, JSON.stringify([]), { flag: 'w' });
        console.log(chalk.gray(`File inizializzato: candles_${timeframe}.json`));
      }
      await fs.writeFile(signalsLogPath, '', { flag: 'w' });
      console.log(chalk.gray('File signals.log creato'));
      console.log(chalk.gray('Cartella data/ resettata e inizializzata'));
    } catch (error) {
      console.error(chalk.red(`Errore nel reset della directory data/: ${error.message}`));
    }
  }

  async loadExchanges() {
    const exchangesDir = path.join(__dirname, 'exchanges');
    try {
      const files = await fs.readdir(exchangesDir);
      for (const file of files) {
        if (file.endsWith('.js')) {
          const exchangeName = path.basename(file, '.js');
          const { default: ExchangeModule } = await import(`./exchanges/${exchangeName}.js`);
          const exchangeInstance = new ExchangeModule();
          this.exchanges.set(exchangeName, exchangeInstance);
          this.strategies.set(exchangeName, new CvdStrategy());
          console.log(chalk.green(`Exchange caricato: ${exchangeName}`));
        }
      }
      console.log(chalk.blue(`Trovati ${this.exchanges.size} exchange(s) per la strategia CVD`));
    } catch (error) {
      console.error(chalk.red(`Errore nel caricamento degli exchange: ${error.message}`));
    }
  }

  async initializeWebSockets() {
    for (const [name, exchange] of this.exchanges) {
      try {
        await exchange.initialize();
        exchange.onTrade((trade) => {
          this.aggregator.processTrade(trade);
          const strategy = this.strategies.get(name);
          strategy.onWebSocketData(trade);
        });
        console.log(chalk.cyan(`Inizializzato ${name}`));
      } catch (error) {
        console.error(chalk.red(`Errore nell'inizializzazione di ${name}: ${error.message}`));
      }
    }
  }

  async start() {
    if (this.running) {
      console.log(chalk.yellow('Il bot è già in esecuzione.'));
      return;
    }

    console.log(chalk.blue('Avvio del Trading Bot per la strategia CVD...'));
    this.running = true;

    // Verifica configurazione
    verifyConfig(config);

    // Resetta la directory data/ all'avvio
    await this.resetDataFolder();

    // Carica gli exchange
    await this.loadExchanges();

    // Pausa per l'utente prima di avviare WebSocket
    await waitForEnter();

    // Inizializza WebSocket
    await this.initializeWebSockets();

    // Avvia il processamento dei segnali
    for (const [exchangeName, strategy] of this.strategies) {
      setInterval(async () => {
        const signals = strategy.activeTrade ? [strategy.activeTrade] : [];
        for (const signal of signals) {
          if (!signal.logged) {
            const logMessage = `${signal.entryType} Signal @ ${new Date(signal.entryTime).toISOString()} - Price: ${signal.entryPrice}, SL: ${signal.slTarget}, TP: ${signal.tpTarget} [${exchangeName}]`;
            if (config.logSignals) {
              console.log(chalk.green(logMessage));
            }
            await appendToLog(logMessage);
            signal.logged = true;
          }
        }
        console.log(chalk.gray(`Processamento segnali per ${exchangeName}`));
      }, 1000);
    }

    console.log(chalk.green('Trading Bot avviato con successo per cvdStrategy.js!'));
  }

  async stop() {
    if (!this.running) {
      console.log(chalk.yellow('Il bot non è in esecuzione.'));
      return;
    }

    for (const [name, exchange] of this.exchanges) {
      await exchange.disconnectWebSocket();
      console.log(chalk.cyan(`Connessione WebSocket chiusa per ${name}`));
    }

    this.running = false;
    console.log(chalk.blue('Trading Bot fermato.'));
  }
}

const bot = new TradingBot();

async function main() {
  try {
    await bot.start();

    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\nRicevuto SIGINT. Arresto del bot...'));
      await bot.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error(chalk.red(`Errore nell'esecuzione del bot: ${error.message}`));
    process.exit(1);
  }
}

main();