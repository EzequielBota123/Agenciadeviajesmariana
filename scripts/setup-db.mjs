// Aplica db/schema.sql contra DATABASE_URL.
//   node scripts/setup-db.mjs
// Lee .env.local o .env si existen, así no hace falta exportar la variable a mano.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

for (const file of ['.env.local', '.env']) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    'Falta DATABASE_URL.\n' +
      'Copiá .env.example a .env.local y pegá la connection string de Vercel Postgres / Neon.',
  );
  process.exit(1);
}

const schema = readFileSync(join(root, 'db', 'schema.sql'), 'utf8');
const sql = neon(process.env.DATABASE_URL);

// El driver serverless no acepta varios statements en una sola llamada:
// separamos por ";" respetando los comentarios.
const statements = schema
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Aplicando ${statements.length} statements...`);

for (const statement of statements) {
  const label = statement.replace(/\s+/g, ' ').slice(0, 70);
  try {
    await sql.query(statement);
    console.log(`  ok  ${label}`);
  } catch (err) {
    console.error(`  ERR ${label}`);
    console.error(`      ${err.message}`);
    process.exit(1);
  }
}

console.log('\nEsquema aplicado. Ya podés levantar la app con DATABASE_URL configurada.');
