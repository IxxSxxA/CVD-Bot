// src/fileCopier.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const publicDataDir = path.join(__dirname, '../client/public/data');

class FileCopier {
  async start() {
    try {
      // Crea la cartella public/data/ se non esiste
      await fs.mkdir(publicDataDir, { recursive: true });
      console.log(chalk.blue('FileCopier avviato. Monitoraggio della cartella data/...'));

      // Copia iniziale di tutti i file in data/
      await this.copyAllFiles();

      // Monitora la cartella data/ per cambiamenti
      fs.watch(dataDir, { recursive: true }, async (eventType, filename) => {
        if (eventType === 'change' && filename) {
          const sourcePath = path.join(dataDir, filename);
          const destPath = path.join(publicDataDir, filename);
          try {
            await fs.copyFile(sourcePath, destPath);
            console.log(chalk.gray(`Copiato ${filename} in client/public/data/`));
          } catch (error) {
            console.error(chalk.red(`Errore nella copia di ${filename}: ${error.message}`));
          }
        }
      });

      // Mantieni il processo in esecuzione
      setInterval(() => {
        // Questo setInterval vuoto mantiene il processo vivo
      }, 1000);

      // Aggiungi un gestore per SIGINT (Ctrl+C) per una chiusura pulita
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\nFileCopier fermato.'));
        process.exit(0);
      });
    } catch (error) {
      console.error(chalk.red(`Errore nell'avvio di FileCopier: ${error.message}`));
      process.exit(1);
    }
  }

  async copyAllFiles() {
    try {
      const files = await fs.readdir(dataDir);
      for (const file of files) {
        const sourcePath = path.join(dataDir, file);
        const destPath = path.join(publicDataDir, file);
        const stats = await fs.stat(sourcePath);
        if (stats.isFile()) {
          await fs.copyFile(sourcePath, destPath);
          console.log(chalk.gray(`Copiato inizialmente ${file} in client/public/data/`));
        }
      }
    } catch (error) {
      console.error(chalk.red(`Errore nella copia iniziale dei file: ${error.message}`));
    }
  }
}

const fileCopier = new FileCopier();
fileCopier.start();