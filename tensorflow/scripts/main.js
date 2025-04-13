import chalk from 'chalk';
import { DataLoader } from './dataLoader.js';
import { TradingStrategy } from './strategy.js';
import { prepareFeatures } from './indicators.js';
import { TradingModel } from './model.js';
import { ParameterOptimizer } from './optimizer.js';

class TradingBot {
  constructor() {
    this.dataLoader = new DataLoader();
    this.strategy = new TradingStrategy();
    this.model = new TradingModel();
    this.optimizer = new ParameterOptimizer();
    this.memory = [];
    this.isRunning = false;
  }

  // Modifica il ciclo run
  async run() {
    while (true) {
      if (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
  
      this.isRunning = true;
      const startTime = Date.now(); // Dichiarazione spostata qui
      
      try {
        console.log(chalk.cyan('Inizio iterazione'));
        const candles = await this.dataLoader.loadData();
        console.log(chalk.cyan(`Caricate ${candles.length} candele`));
  
        if (candles.length < 60) {
          console.log(chalk.yellow(`Candele insufficienti (${candles.length}/60), in attesa...`));
          await new Promise(resolve => setTimeout(resolve, 60000));
          continue;
        }
  
        const features = prepareFeatures(candles);
        console.log(chalk.cyan(`Feature preparate: ${features.length}`));
        
        this.memory = features;
        await this.model.trainIncremental(features);
        
        try {
          await this.model.save();
          console.log(chalk.green('Modello salvato con successo'));
        } catch (saveError) {
          console.error(chalk.red(`Errore salvataggio modello: ${saveError.message}`));
        }
  
        const modelSignal = await this.model.predict(features);
        const tradeSignal = this.strategy.generateSignal(features, modelSignal);
        const tradeLog = await this.strategy.applyTrade(features, tradeSignal);
  
        if (tradeLog.length > 0) {
          console.log(chalk.magenta('--- Risultato Trade ---'));
          console.log(tradeLog.join('\n'));
        }
  
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, 60000 - elapsed);
        console.log(chalk.cyan(`Iterazione completata in ${elapsed}ms, prossima esecuzione in ${waitTime}ms`));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
      } catch (e) {
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, 60000 - elapsed);
        console.error(chalk.red(`Errore durante l'iterazione: ${e.message}`));
        console.error(chalk.red(`Stack trace: ${e.stack}`));
        console.log(chalk.yellow(`Ripresa in ${waitTime}ms`));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
      } finally {
        this.isRunning = false;
        console.log(chalk.gray('--- Fine iterazione ---\n'));
      }
    }
  }

}

const bot = new TradingBot();
bot.run().catch(e => console.error(chalk.red(`Errore bot: ${e.message}`)));