import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  RotateCcw,
  Share2,
  Trophy,
  X,
  LoaderCircle,
  Play,
  LockKeyhole,
  Braces,
  Blocks,
} from 'lucide-react';
import type { DailyChallenge, Game } from '../../../shared/contracts';
import { api, errorMessage, RequestError } from '../api';
import { difficultyNames, formatDuration, modeNames } from '../lib';
import { CodeEditor } from './CodeEditor';
import { LanguagePicker } from './LanguagePicker';

type Props = {
  challenge: DailyChallenge;
  languages: string[];
  signedIn: boolean;
  practice: boolean;
  onUpdate: () => void;
  onRules: () => void;
  onLogin: () => void;
  nextChallenge?: DailyChallenge;
  onNext?: () => void;
};
export function GameBoard({
  challenge,
  languages,
  signedIn,
  practice,
  onUpdate,
  onRules,
  onLogin,
  nextChallenge,
  onNext,
}: Props) {
  const [game, setGame] = useState<Game | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shared, setShared] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const pending = useRef<{ answer: string; requestId: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  const receive = (result: Game) => {
    if (!mounted.current) return;
    setGame(result);
    setOffset(Date.parse(result.serverTime) - Date.now());
    setNow(Date.now());
  };
  async function start(restart = false) {
    setBusy(true);
    setError('');
    try {
      receive(await api<Game>('/sessions', { dailyId: challenge.id, restart }));
      onUpdate();
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!game || !answer.trim() || busy) return;
    setBusy(true);
    setError('');
    if (pending.current?.answer !== answer.trim())
      pending.current = { answer: answer.trim(), requestId: crypto.randomUUID() };
    try {
      const result = await api<Game>(`/sessions/${game.id}/guesses`, pending.current);
      receive(result);
      pending.current = null;
      if (mounted.current) setAnswer('');
      onUpdate();
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
      if (error instanceof RequestError && error.status < 500) {
        pending.current = null;
        if (error.status === 409) {
          try {
            receive(await api<Game>('/sessions', { dailyId: challenge.id }));
          } catch {
            /* Mantém a mensagem original. */
          }
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const elapsed = game
    ? Math.max(
        0,
        (game.finishedAt ? Date.parse(game.finishedAt) : now + offset) - Date.parse(game.startedAt),
      )
    : 0;
  const playing = game?.status === 'playing';
  const terminal = game && !playing;
  const label =
    challenge.mode === 'code'
      ? 'Qual é a linguagem?'
      : challenge.mode === 'acronym'
        ? 'O que essa sigla significa?'
        : 'Qual linguagem está por trás desse framework?';
  const startContent = (
    <>
      <h3>{practice ? 'Um bom dia para praticar.' : 'Um código. Cinco tentativas.'}</h3>
      <p>
        {practice
          ? 'Revise seus conhecimentos, no seu ritmo.'
          : 'Observe as pistas e confie no que você sabe.'}
      </p>
      <button className="button primary" onClick={() => void start()} disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <Play size={16} fill="currentColor" />
        )}{' '}
        {challenge.status ? 'Retomar desafio' : 'Começar desafio'}
      </button>
    </>
  );
  return (
    <section className="game-card" aria-label="Área do desafio">
      <div className="game-meta">
        <span className="meta-label">
          {practice ? 'MODO TREINO' : 'DESAFIO DO DIA'} <span className="meta-separator">/</span>{' '}
          {challenge.mode === 'code'
            ? difficultyNames[challenge.difficulty]
            : modeNames[challenge.mode]}
        </span>
        <button className="quiet-button" onClick={onRules}>
          <CircleHelp size={15} /> Como jogar
        </button>
      </div>
      {challenge.mode === 'code' ? (
        <CodeEditor content={game?.content}>{startContent}</CodeEditor>
      ) : (
        <div className={`prompt-display ${game ? 'revealed' : ''}`}>
          <span className="prompt-icon">
            {challenge.mode === 'acronym' ? <Braces size={27} /> : <Blocks size={27} />}
          </span>
          {game ? (
            <>
              <span className="eyebrow">
                {challenge.mode === 'acronym' ? 'DECIFRE A SIGLA' : 'CONECTE O FRAMEWORK'}
              </span>
              <h3>{game.content}</h3>
              <p>
                {challenge.mode === 'acronym'
                  ? 'Pequenas letras, um grande significado.'
                  : 'Todo framework tem uma linguagem por trás.'}
              </p>
            </>
          ) : (
            <>
              <h3>
                {challenge.mode === 'acronym'
                  ? 'Você conhece o significado?'
                  : 'Reconhece esse framework?'}
              </h3>
              <p>Revele a pergunta para começar.</p>
              <button className="button primary" onClick={() => void start()} disabled={busy}>
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}{' '}
                {challenge.status ? 'Retomar desafio' : 'Começar desafio'}
              </button>
            </>
          )}
        </div>
      )}
      <div className="answer-area">
        <div className="answer-top">
          <label htmlFor="answer">{label}</label>
          <span className="timer">
            <Clock3 size={14} /> {formatDuration(elapsed)}
          </span>
        </div>
        <form onSubmit={submit} className="answer-form">
          {challenge.mode === 'acronym' ? (
            <input
              id="answer"
              className="text-input"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Escreva o significado completo em inglês"
              autoComplete="off"
              spellCheck={false}
              maxLength={160}
              disabled={!playing || busy}
            />
          ) : (
            <LanguagePicker
              value={answer}
              onChange={setAnswer}
              options={languages}
              disabled={!playing || busy}
            />
          )}
          <button
            className="button primary answer-submit"
            type="submit"
            disabled={!playing || busy || !answer.trim()}
          >
            {busy && game ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <>
                Enviar <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        <div className="attempts-row">
          <div
            className="attempt-indicators"
            aria-label={`${game?.guesses.length || 0} de 5 tentativas usadas`}
          >
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className={
                  game?.guesses[index]
                    ? game.guesses[index].correct
                      ? 'correct'
                      : 'incorrect'
                    : ''
                }
              >
                {game?.guesses[index] ? (
                  game.guesses[index].correct ? (
                    <Check size={12} />
                  ) : (
                    <X size={12} />
                  )
                ) : (
                  index + 1
                )}
              </span>
            ))}
            <span className="attempt-caption">
              {game
                ? `${game.attemptsLeft} ${game.attemptsLeft === 1 ? 'tentativa restante' : 'tentativas restantes'}`
                : '5 tentativas para descobrir'}
            </span>
          </div>
          <span className="points-caption">
            {practice || (game && !game.ranked)
              ? 'Sem pontuação'
              : `Até ${challenge.maxPoints} pontos`}
          </span>
        </div>
        {error && (
          <div className="feedback error" role="alert">
            {error}
          </div>
        )}
        {!!game?.guesses.length && (
          <ol className="guess-history" aria-label="Suas tentativas">
            {game.guesses.map((guess) => (
              <li className={guess.correct ? 'correct' : ''} key={guess.number}>
                <span>
                  <span className="guess-number">0{guess.number}</span>
                  {guess.text}
                </span>
                {guess.correct ? (
                  <span>
                    <Check size={15} /> Acertou
                  </span>
                ) : (
                  <span>
                    <X size={15} /> Tente outra
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {game?.hint && (
          <div className="language-hint" role="note">
            <span className="language-hint-title"><CircleHelp size={16} /> Dica da linguagem</span>
            <p>{game.hint}</p>
          </div>
        )}
        {terminal && (
          <div className={`result-panel ${game.status === 'won' ? 'won' : ''}`} role="status">
            <div>
              <strong>
                {game.status === 'won'
                  ? 'Boa! Você reconheceu as pistas.'
                  : game.status === 'expired'
                    ? 'Uma nova edição já começou.'
                    : 'Essa ficou para a próxima.'}
              </strong>
              <p>
                {game.status === 'won'
                  ? game.ranked
                    ? `+${game.points} pontos no seu ranking. Desafio concluído!`
                    : 'Desafio concluído. Continue explorando e aprendendo.'
                  : game.status === 'expired'
                    ? 'A partida anterior foi encerrada sem pontuação.'
                    : 'Você pode explorar outros desafios e voltar amanhã.'}
              </p>
            </div>
            <div className="result-actions">
              {game.status === 'won' && nextChallenge && onNext && (
                <button className="button primary small" onClick={onNext}>
                  Ir para {nextChallenge.mode === 'code'
                    ? `o desafio ${difficultyNames[nextChallenge.difficulty].toLowerCase()}`
                    : nextChallenge.mode === 'acronym' ? 'siglas' : 'frameworks'}
                  <ArrowRight size={15} />
                </button>
              )}
              {practice && (
                <button
                  className="button secondary small"
                  onClick={() => void start(true)}
                  disabled={busy}
                >
                  <RotateCcw size={15} /> Treinar novamente
                </button>
              )}
              <button
                className="button secondary small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `What Is The Syntax? · ${game.date}\n${modeNames[game.mode]} · ${difficultyNames[game.difficulty]}\n${game.guesses.map((guess) => (guess.correct ? '🟩' : '🟥')).join('')}\n${game.ranked ? `${game.points} pontos\n` : ''}${window.location.origin}`,
                    );
                    setShared(true);
                  } catch {
                    setError('Não foi possível copiar o resultado neste navegador.');
                  }
                }}
              >
                <Share2 size={15} /> {shared ? 'Copiado!' : 'Compartilhar'}
              </button>
            </div>
          </div>
        )}
        {!signedIn && !practice && (
          <div className="login-nudge">
            <LockKeyhole size={14} />
            <span>
              Jogue à vontade. <button onClick={onLogin}>Entre antes de começar</button> para
              pontuar.
            </span>
          </div>
        )}
        {signedIn && !practice && !game && (
          <div className="login-nudge">
            <Trophy size={14} />
            <span>Você está conectado. Este desafio vale pontos no ranking.</span>
          </div>
        )}
      </div>
    </section>
  );
}
