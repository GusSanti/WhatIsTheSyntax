import type { Difficulty } from '../shared/contracts.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const TIME_ZONE = 'America/Sao_Paulo';
export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
  standard: 100,
};

// Preserva # e +: C, C# e C++ são respostas diferentes.
export function normalizeLanguage(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
const LANGUAGE_ALIASES: Record<string, string> = {
  csharp: 'c#', 'c sharp': 'c#', cpp: 'c++', 'c plus plus': 'c++',
  js: 'javascript', 'java script': 'javascript', ts: 'typescript',
  'type script': 'typescript', py: 'python', rb: 'ruby', golang: 'go',
};
export function resolveLanguage(value: string) {
  const normalized = normalizeLanguage(value);
  return LANGUAGE_ALIASES[normalized] || normalized;
}
export function normalizeAcronym(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
export function normalizePublicName(value: string) {
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (
    Array.from(name).length < 3 ||
    Array.from(name).length > 24 ||
    !/^[\p{L}\p{N}]+(?:[ ._-][\p{L}\p{N}]+)*$/u.test(name)
  )
    throw new ApiError(
      422,
      'Use de 3 a 24 caracteres: letras, números, espaços, ponto, hífen ou sublinhado.',
    );
  return name;
}
export function gameDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}
export function shiftDate(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function nextReset(now = new Date()) {
  // Localiza a mudança de dia no fuso configurado, sem depender do fuso do computador.
  const day = gameDate(now);
  let low = now.getTime(),
    high = low + 27 * 60 * 60 * 1000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (gameDate(new Date(mid)) === day) low = mid;
    else high = mid;
  }
  return new Date(high).toISOString();
}
export function calculatePoints(difficulty: Difficulty, attempt: number, elapsedMs: number) {
  if (
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > 5 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  )
    throw new Error('Invalid scoring input');
  const base = BASE_POINTS[difficulty];
  const speedBonus = base * 0.25 * Math.max(0, 1 - elapsedMs / 120_000);
  return Math.round((base + speedBonus) * [1, 0.7, 0.4, 0.2, 0.1][attempt - 1]);
}
