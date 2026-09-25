import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePoints,
  gameDate,
  nextReset,
  normalizeAcronym,
  normalizeLanguage,
} from '../server/domain.js';

test('normaliza espaços, caixa e Unicode sem destruir símbolos de linguagens', () => {
  assert.equal(normalizeLanguage('  JaVaScRiPt  '), 'javascript');
  assert.equal(normalizeLanguage('Ｃ＃'), 'c#');
  assert.notEqual(normalizeLanguage('C#'), normalizeLanguage('C++'));
  assert.notEqual(normalizeLanguage('C'), normalizeLanguage('C++'));
  assert.equal(normalizeLanguage(' C   Sharp '), 'c sharp');
});
test('siglas aceitam caixa, acentos, hífens e espaços, mas exigem termo completo', () => {
  assert.equal(normalizeAcronym('  SOFTWARE-as  a SERVICE! '), 'software as a service');
  assert.equal(normalizeAcronym('Object-Oriented Programming'), 'object oriented programming');
  assert.notEqual(normalizeAcronym('Software Service'), normalizeAcronym('Software as a Service'));
});
test('pontuação respeita bônus limitado, tempo e tentativas', () => {
  assert.equal(calculatePoints('easy', 1, 0), 125);
  assert.equal(calculatePoints('medium', 2, 60_000), 158);
  assert.equal(calculatePoints('hard', 3, 120_000), 120);
  assert.equal(calculatePoints('easy', 1, 86_400_000), 100);
  assert.throws(() => calculatePoints('easy', 4, 0));
  assert.throws(() => calculatePoints('easy', 1, -1));
});
test('virada de dia e mês usa Brasília, independentemente do relógio local', () => {
  assert.equal(gameDate(new Date('2026-10-01T02:59:59Z')), '2026-09-30');
  assert.equal(gameDate(new Date('2026-10-01T03:00:00Z')), '2026-10-01');
  assert.equal(nextReset(new Date('2026-09-30T23:00:00Z')), '2026-10-01T03:00:00.000Z');
});
