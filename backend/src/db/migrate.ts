import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from './pool';

export async function runMigrations(): Promise<string[]> {
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await db.query(sql);
    applied.push(file);
  }
  return applied;
}
