import type { Difficulty, Mode } from '../../shared/contracts';
export const difficultyNames: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  standard: 'Único',
};
export const modeNames: Record<Mode, string> = {
  code: 'Linguagem',
  acronym: 'Siglas',
  framework: 'Frameworks',
};
export const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
export function formatDate(
  day: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('pt-BR', {
    ...options,
    timeZone: 'America/Sao_Paulo',
  });
}
