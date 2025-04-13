import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

async function createProjectStructure() {
  const baseDir = 'tfjs';
  const folders = [
    join(baseDir, 'data'),
    join(baseDir, 'models'),
    join(baseDir, 'scripts'),
    join(baseDir, 'logs')
  ];

  for (const folder of folders) {
    await mkdir(folder, { recursive: true });
    console.log(`Creato: ${folder}`);
  }

  // Crea README
  await writeFile(join(baseDir, 'README.md'), '# Trading Bot\n\nProgetto per trading live con TF.js');
  console.log('Creato: README.md');
}

createProjectStructure().catch(console.error);