import { readFile } from 'fs/promises';
import chalk from 'chalk';

export class DataLoader {
  constructor(filePath = '../data/candles_1m.json', maxWindow = 1440) {
    this.filePath = filePath;
    this.maxWindow = maxWindow;
    this.data = [];
  }

  async loadData() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const jsonData = JSON.parse(raw);
      console.log(chalk.cyan(`Caricato ${jsonData.length} candele da ${this.filePath}`));
      return jsonData.map(candle => ({
        ...candle,
        timestamp: new Date(candle.timestamp)
      }));
    } catch (e) {
      console.error(chalk.red(`Errore caricamento dati da ${this.filePath}: ${e.message}`));
      return [];
    }
  }

  // Aggiungi controllo duplicati più robusto
async updateData() {
  const newData = await this.loadData();
  if (newData.length === 0) return [];
  
  // Usa un Set per rimuovere duplicati
  const uniqueTimestamps = new Set();
  this.data = newData
    .filter(candle => {
      const timestamp = candle.timestamp.getTime();
      if (uniqueTimestamps.has(timestamp)) return false;
      uniqueTimestamps.add(timestamp);
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-this.maxWindow);
    
  return this.data;
}

  getLatestCandles(n = 100) {
    return this.data.slice(-n);
  }
}