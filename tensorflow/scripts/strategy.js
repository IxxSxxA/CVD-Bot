import chalk from 'chalk';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { FileLock } from './fileLock.js';

export class TradingStrategy {
  constructor(params = {}) {
    this.fileLock = new FileLock(this.stateFile);
    this.params = {
      atrMultiplierSl: params.atrMultiplierSl || 1,
      atrMultiplierTp: params.atrMultiplierTp || 2,
      cvdThreshold: params.cvdThreshold || 0.1,
      fvgMinGapFactor: params.fvgMinGapFactor || 0.05
    };
    this.position = null;
    this.entryPrice = null;
    this.sl = null;
    this.tp = null;
    this.trades = [];
    this.stateLoaded = false;
    this.stateFile = join(process.cwd(), 'logs', 'strategy_state.json');
    this.capital = params.initialCapital || 10000;
    this.maxDrawdown = params.maxDrawdown || 0.2;
    this.pauseTrading = false;
    this.resetStateFile().catch(e => console.error(chalk.red(`Errore reset stato: ${e.message}`)));
  }

  async resetStateFile() {
    try {
      await mkdir(join(process.cwd(), 'logs'), { recursive: true });
      await writeFile(this.stateFile, JSON.stringify([], null, 2), { encoding: 'utf8', mode: 0o664 });
      console.log(chalk.cyan(`File stato resettato: ${this.stateFile}`));
    } catch (e) {
      console.error(chalk.red(`Errore reset file stato: ${e.message}`));
    }
  }

  async loadState() {
    if (this.stateLoaded) {
      console.log(chalk.gray('Stato già caricato, salto'));
      return;
    }
    this.stateLoaded = true;
    try {
      await access(this.stateFile);
      const data = await readFile(this.stateFile, 'utf8');
      const states = JSON.parse(data);
      if (Array.isArray(states) && states.length > 0) {
        const latestState = states[states.length - 1];
        this.position = latestState.position;
        this.entryPrice = latestState.entryPrice;
        this.sl = latestState.sl;
        this.tp = latestState.tp;
        this.capital = latestState.capital || this.capital;
        console.log(chalk.cyan(`Stato caricato: ${JSON.stringify(latestState)}`));
      } else {
        console.log(chalk.yellow('Nessun stato valido nel file'));
      }
    } catch (e) {
      console.log(chalk.yellow(`Nessuno stato salvato in ${this.stateFile}: ${e.message}`));
    }
  }

  async saveState(candleTimestamp) {
    return this.fileLock.withLock(async () => {
      try {
        const state = {
          timestamp: candleTimestamp ? new Date(candleTimestamp).getTime() : Date.now(),
          position: this.position,
          entryPrice: this.entryPrice,
          sl: this.sl,
          tp: this.tp,
          capital: this.capital
        };
        
        if (this.lastSavedState && 
            JSON.stringify(this.lastSavedState) === JSON.stringify(state)) {
          return;
        }
        
        await mkdir(join(process.cwd(), 'logs'), { recursive: true });
        await writeFile(this.stateFile, JSON.stringify([state], null, 2));
        this.lastSavedState = state;
      } catch (e) {
        console.error(chalk.red(`Errore salvataggio stato: ${e.message}`));
      }
    });
  }

  generateSignal(candles, modelSignal) {
    if (this.pauseTrading) {
      console.log(chalk.yellow('Trading in pausa per drawdown eccessivo'));
      return 'hold';
    }

    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2] || {};
    
    // Calcola trend e volume medio
    const isUptrend = latest.close > candles[Math.max(0, candles.length - 10)].close;
    const volumeAvg = candles.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;
    const highVolume = latest.volume > volumeAvg * 1.5;
    
    // Condizioni avanzate
    const cvdStrongBull = latest.cvd > this.params.cvdThreshold * 1.5;
    const cvdWeakBull = latest.cvd > this.params.cvdThreshold;
    const cvdStrongBear = latest.cvd < -this.params.cvdThreshold * 1.5;
    const fvgConfirmed = latest.fvgBull && latest.close > prev.high;
    
    console.log(chalk.cyan(
      `CVD: ${latest.cvd?.toFixed(2) ?? 'N/A'}, ` +
      `Trend: ${isUptrend ? 'UP' : 'DOWN'}, ` +
      `Volume: ${highVolume ? 'HIGH' : 'normal'}, ` +
      `Model: ${modelSignal}`
    ));
    
    // Logica di trading migliorata
    if (cvdStrongBull && modelSignal === 1 && (isUptrend || fvgConfirmed)) {
      console.log(chalk.green('STRONG BUY: CVD forte + trend/fvg'));
      return 'buy';
    } else if (cvdWeakBull && modelSignal === 1 && highVolume) {
      console.log(chalk.green('BUY: CVD positivo + volume alto'));
      return 'buy';
    } else if (cvdStrongBear) {
      console.log(chalk.red('STRONG SELL: CVD fortemente negativo'));
      return 'sell';
    }
    
    console.log(chalk.gray('Nessun segnale forte, mantengo HOLD'));
    return 'hold';
  }

  async applyTrade(candles, signal) {
    if (this.pauseTrading) {
      return [chalk.yellow('Trading in pausa per drawdown eccessivo')];
    }

    const latest = candles[candles.length - 1];
    const log = [];
    
    if (!latest?.close) {
      console.log(chalk.red('Dati candela incompleti'));
      return log;
    }
    
    const atr = Number(latest.atr) || 100;
    const riskPercent = 0.02; // Rischio del 2% per trade
    const positionSize = (this.capital * riskPercent) / (atr * this.params.atrMultiplierSl);
    
    // Apertura posizione
    if (signal === 'buy' && !this.position) {
      this.position = {
        type: 'long',
        entryPrice: Number(latest.close),
        sl: latest.close - atr * this.params.atrMultiplierSl,
        tp: latest.close + atr * this.params.atrMultiplierTp,
        size: positionSize,
        highestProfit: 0
      };
      log.push(chalk.green(
        `BUY at ${this.position.entryPrice.toFixed(2)}, ` +
        `Size: ${positionSize.toFixed(2)}, ` +
        `SL: ${this.position.sl.toFixed(2)}, ` +
        `TP: ${this.position.tp.toFixed(2)}`
      ));
      await this.saveState(latest.timestamp);
    } 
    else if (signal === 'sell' && !this.position) {
      this.position = {
        type: 'short',
        entryPrice: Number(latest.close),
        sl: latest.close + atr * this.params.atrMultiplierSl,
        tp: latest.close - atr * this.params.atrMultiplierTp,
        size: positionSize,
        highestProfit: 0
      };
      log.push(chalk.red(
        `SELL at ${this.position.entryPrice.toFixed(2)}, ` +
        `Size: ${positionSize.toFixed(2)}, ` +
        `SL: ${this.position.sl.toFixed(2)}, ` +
        `TP: ${this.position.tp.toFixed(2)}`
      ));
      await this.saveState(latest.timestamp);
    }
    
    // Gestione posizione aperta
    if (this.position) {
      const currentPrice = latest.close;
      let profit = 0;
      
      // Trailing stop per long
      if (this.position.type === 'long') {
        profit = currentPrice - this.position.entryPrice;
        this.position.highestProfit = Math.max(this.position.highestProfit, profit);
        
        // Aggiusta SL se in profitto
        if (profit > atr * 0.5) {
          const newSl = currentPrice - atr * this.params.atrMultiplierSl * 0.8;
          if (newSl > this.position.sl) {
            this.position.sl = newSl;
            log.push(chalk.blue(`SL aggiornato a ${newSl.toFixed(2)}`));
          }
        }
        
        // Check chiusura
        if (latest.low <= this.position.sl) {
          profit = this.position.sl - this.position.entryPrice;
          log.push(chalk.red(`SL HIT at ${this.position.sl.toFixed(2)}, Profit: ${profit.toFixed(2)}`));
        } else if (latest.high >= this.position.tp) {
          profit = this.position.tp - this.position.entryPrice;
          log.push(chalk.green(`TP HIT at ${this.position.tp.toFixed(2)}, Profit: ${profit.toFixed(2)}`));
        }
      }
      // Trailing stop per short
      else if (this.position.type === 'short') {
        profit = this.position.entryPrice - currentPrice;
        this.position.highestProfit = Math.max(this.position.highestProfit, profit);
        
        // Aggiusta SL se in profitto
        if (profit > atr * 0.5) {
          const newSl = currentPrice + atr * this.params.atrMultiplierSl * 0.8;
          if (newSl < this.position.sl) {
            this.position.sl = newSl;
            log.push(chalk.blue(`SL aggiornato a ${newSl.toFixed(2)}`));
          }
        }
        
        // Check chiusura
        if (latest.high >= this.position.sl) {
          profit = this.position.entryPrice - this.position.sl;
          log.push(chalk.red(`SL HIT at ${this.position.sl.toFixed(2)}, Profit: ${profit.toFixed(2)}`));
        } else if (latest.low <= this.position.tp) {
          profit = this.position.entryPrice - this.position.tp;
          log.push(chalk.green(`TP HIT at ${this.position.tp.toFixed(2)}, Profit: ${profit.toFixed(2)}`));
        }
      }
      
      // Chiusura posizione
      if (latest.low <= this.position.sl || latest.high >= this.position.tp) {
        const profitPct = (profit / this.capital) * 100;
        this.capital += profit;
        this.trades.push({
          type: this.position.type,
          entry: this.position.entryPrice,
          exit: profit > 0 ? this.position.tp : this.position.sl,
          profit,
          profitPct,
          timestamp: latest.timestamp
        });
        
        // Check drawdown
        if (this.capital < (this.params.initialCapital || 10000) * (1 - this.maxDrawdown)) {
          this.pauseTrading = true;
          log.push(chalk.red.bold(`DRAWDOWN LIMIT (${this.maxDrawdown*100}%) RAGGIUNTO! Trading in pausa`));
        }
        
        this.position = null;
        await this.saveState(latest.timestamp);
      } else {
        log.push(chalk.yellow(
          `Posizione ${this.position.type}: ` +
          `Entry ${this.position.entryPrice.toFixed(2)}, ` +
          `Current ${currentPrice.toFixed(2)}, ` +
          `SL ${this.position.sl.toFixed(2)}, ` +
          `TP ${this.position.tp.toFixed(2)}`
        ));
      }
    }
    
    return log;
  }

  getPerformance() {
    if (this.trades.length === 0) return null;
    
    const profits = this.trades.map(t => t.profit);
    const wins = this.trades.filter(t => t.profit > 0);
    const losses = this.trades.filter(t => t.profit <= 0);
    
    return {
      totalTrades: this.trades.length,
      winRate: wins.length / this.trades.length,
      avgWin: wins.reduce((sum, t) => sum + t.profit, 0) / (wins.length || 1),
      avgLoss: losses.reduce((sum, t) => sum + t.profit, 0) / (losses.length || 1),
      profitFactor: wins.reduce((sum, t) => sum + t.profit, 0) / 
                   (Math.abs(losses.reduce((sum, t) => sum + t.profit, 0)) || 1),
      maxDrawdown: this.calculateDrawdown(),
      sharpeRatio: this.calculateSharpeRatio()
    };
  }

  calculateDrawdown() {
    let peak = this.params.initialCapital || 10000;
    let maxDrawdown = 0;
    let current = peak;
    
    for (const trade of this.trades) {
      current += trade.profit;
      if (current > peak) peak = current;
      const drawdown = (peak - current) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    return maxDrawdown;
  }

  calculateSharpeRatio(riskFreeRate = 0) {
    if (this.trades.length < 2) return 0;
    
    const returns = this.trades.map(t => t.profitPct / 100);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.map(r => Math.pow(r - avgReturn, 2)).reduce((sum, x) => sum + x, 0) / returns.length
    );
    
    return stdDev > 0 ? (avgReturn - riskFreeRate) / stdDev : 0;
  }
}