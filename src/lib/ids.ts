import { randomUUID, randomBytes } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

/** Token corto para el link público de la cotización: /q/xxxxxxxxxxxx */
export function newToken(): string {
  return randomBytes(9).toString('base64url');
}

// Marcas diacríticas combinantes (los acentos que quedan sueltos tras NFD).
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
