// file: fileLock.js
import { promises as fs } from 'fs';
import path from 'path';

export class FileLock {
  constructor(filePath) {
    this.lockFile = `${filePath}.lock`;
    this.locked = false;
  }

  async acquire() {
    while (this.locked) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.locked = true;
    try {
      await fs.writeFile(this.lockFile, '');
    } catch (e) {
      this.locked = false;
      throw e;
    }
  }

  async release() {
    try {
      await fs.unlink(this.lockFile);
    } finally {
      this.locked = false;
    }
  }

  async withLock(callback) {
    await this.acquire();
    try {
      return await callback();
    } finally {
      await this.release();
    }
  }
}