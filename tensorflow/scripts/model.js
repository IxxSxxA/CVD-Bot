import * as tf from '@tensorflow/tfjs-node';
import chalk from 'chalk';
import { mkdir } from 'fs/promises';

export class TradingModel {
  constructor(sequenceLength = 60, nFeatures = 5) {
    this.sequenceLength = sequenceLength;
    this.nFeatures = nFeatures;
    this.model = this.buildModel();
    this.memory = [];
    this.scaler = { min: null, max: null };
    this.lastSaved = 0;
    this.lastPredicted = 0;
  }

  buildModel() {
    const model = tf.sequential();
    model.add(tf.layers.lstm({
      units: 50,
      returnSequences: true,
      inputShape: [this.sequenceLength, this.nFeatures]
    }));
    model.add(tf.layers.lstm({ units: 50 }));
    model.add(tf.layers.dense({ units: 25, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));
    this.compileModel(model);
    return model;
  }

  compileModel(model) {
    model.compile({
      optimizer: 'adam',
      loss: 'sparseCategoricalCrossentropy',
      metrics: ['accuracy']
    });
    console.log(chalk.cyan('Modello compilato'));
  }

  normalize(data) {
    if (!data.length) {
      console.log(chalk.yellow('Nessun dato da normalizzare'));
      return data;
    }
    if (!this.scaler.min) {
      this.scaler.min = data[0].map((_, i) => Math.min(...data.map(row => row[i] || 0)));
      this.scaler.max = data[0].map((_, i) => Math.max(...data.map(row => row[i] || 0)));
    }
    return data.map(row =>
      row.map((val, i) => 
        (val - this.scaler.min[i]) / (this.scaler.max[i] - this.scaler.min[i] || 1)
      )
    );
  }

  prepareData(candles) {
    console.log(chalk.cyan(`Candele ricevute: ${candles.length}`));
    const features = candles.map(c => [
      c.close || 0,
      c.cvdCumulative || 0,
      c.volumeBuy || 0,
      c.volumeSell || 0,
      c.atr || 0
    ]).filter(row => row.every(v => v !== undefined && !isNaN(v)));
    
    console.log(chalk.cyan(`Candele valide: ${features.length}`));
    
    if (features.length < this.sequenceLength + 1) {
      console.log(chalk.yellow('Dati insufficienti per creare sequenze'));
      return { X: [], y: [] };
    }
    
    const normalized = this.normalize(features);
    const X = [];
    const y = [];
    
    for (let i = this.sequenceLength; i < features.length; i++) {
      X.push(normalized.slice(i - this.sequenceLength, i));
      const futureClose = features[i][0];
      const currentClose = features[i - 1][0];
      if (futureClose > currentClose * 1.001) {
        y.push(1); // Buy
      } else if (futureClose < currentClose * 0.999) {
        y.push(0); // Sell
      } else {
        y.push(2); // Hold
      }
    }
    
    console.log(chalk.cyan(`Sequenze create: ${X.length}`));
    return { X, y };
  }

  updateMemory(candles) {
    this.memory = candles.slice(-1440);
    console.log(chalk.cyan(`Memoria aggiornata: ${this.memory.length} candele`));
    return this.memory;
  }

  async trainIncremental(candles, batchSize = 32) {
    console.log(chalk.cyan(`Candele per addestramento: ${candles.length}`));
    const memory = this.updateMemory(candles);
    const { X, y } = this.prepareData(memory);
    
    if (X.length === 0) {
      console.log(chalk.yellow('Dati insufficienti per addestramento'));
      return;
    }
    
    const xs = tf.tensor3d(X);
    const ys = tf.tensor1d(y, 'float32');
    
    console.log(chalk.cyan('Inizio addestramento...'));
    console.log("Dati di training: ", xs.shape, ys.shape);
    try {
      await this.model.fit(xs, ys, {
        epochs: 1,
        batchSize,
        shuffle: true,
        verbose: 0
      });
      console.log(chalk.green('Modello aggiornato'));
    } catch (e) {
      console.error(chalk.red(`Errore addestramento: ${e.message}`));
    }
    
    xs.dispose();
    ys.dispose();
  }

  async predict(candles) {
    const now = Date.now();
    if (now - this.lastPredicted < 1000) {
      console.log(chalk.gray('Previsione recente, salto'));
      return null;
    }
    this.lastPredicted = now;
    console.log(chalk.cyan(`Candele per previsione: ${candles.length}`));
    const { X } = this.prepareData(candles);
    if (X.length === 0) {
      console.log(chalk.yellow('Dati insufficienti per previsione'));
      return null;
    }
    
    const xs = tf.tensor3d([X[X.length - 1]]);
    const prediction = await this.model.predict(xs).data();
    xs.dispose();
    
    const signal = prediction.indexOf(Math.max(...prediction));
    console.log(chalk.cyan(`Segnale generato: ${signal} (0=Sell, 1=Buy, 2=Hold)`));
    return signal;
  }

  async save(path = 'file://./models/lstm_model') {
    const now = Date.now();
    if (now - this.lastSaved < 60000) {
      console.log(chalk.gray('Salvataggio modello recente, salto'));
      return;
    }
    this.lastSaved = now;
    try {
      console.log(chalk.cyan('Tentativo di salvataggio modello...'));
      await mkdir('./models/lstm_model', { recursive: true });
      await this.model.save(path);
      console.log(chalk.green('Modello salvato in tensorflow/models/lstm_model'));
    } catch (e) {
      console.error(chalk.red(`Errore salvataggio modello: ${e.message}`));
    }
  }

  async load(path = 'file://./models/lstm_model/model.json') {
    try {
      this.model = await tf.loadLayersModel(path);
      this.compileModel(this.model);
      console.log(chalk.green('Modello caricato e compilato da tensorflow/models/lstm_model/model.json'));
    } catch (e) {
      console.log(chalk.yellow(`Nessun modello trovato: ${e.message}`));
      this.model = this.buildModel();
    }
  }
}