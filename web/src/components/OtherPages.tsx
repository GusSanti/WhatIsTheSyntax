import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  History,
  Medal,
  Search,
  Trophy,
  LoaderCircle,
} from 'lucide-react';
import type { ArchiveDay, DailyChallenge, Profile, Ranking } from '../../../shared/contracts';
import { api, errorMessage } from '../api';
import { Avatar } from './Avatar';
import { difficultyNames, formatDate, formatNumber, modeNames } from '../lib';

export function ArchivePage({ onSelect }: { onSelect: (challenge: DailyChallenge) => void }) {
  const [days, setDays] = useState<ArchiveDay[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setError('');
    void api<{ days: ArchiveDay[] }>('/archive')
      .then((result) => {
        if (alive) setDays(result.days);
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [retry]);
  return (
    <>
      <div className="page-hero">
        <span className="eyebrow">
          <History size={14} /> O CONHECIMENTO FICA
        </span>
        <h1>
          Todo dia merece
          <br />
          uma segunda tentativa<span>.</span>
        </h1>
        <p>
          Revisite os desafios anteriores, descubra novas pistas
          <br className="desktop-break" /> e pratique no seu ritmo. Aqui, o aprendizado é o prêmio.
        </p>
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Arquivo de desafios <span className="count-badge">{days?.length || 0} edições</span>
          </h2>
          <p>As últimas 30 edições publicadas, sempre sem pontuação.</p>
        </div>
        <label className="filter-label">
          Mostrar{' '}
          <select
            aria-label="Filtrar arquivo por modo"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">Todos os modos</option>
            <option value="code">Linguagens</option>
            <option value="acronym">Siglas</option>
            <option value="framework">Frameworks</option>
          </select>
        </label>
      </div>
      {error ? (
        <div className="feedback error" role="alert">
          {error} <button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
        </div>
      ) : !days ? (
        <div className="loading-inline">
          <LoaderCircle className="spin" /> Carregando edições…
        </div>
      ) : !days.length ? (
        <div className="empty-state">
          <History size={36} />
          <h3>O arquivo começa amanhã.</h3>
          <p>Os desafios publicados aparecerão aqui depois da virada do dia.</p>
        </div>
      ) : (
        <div className="archive-grid">
          {days.map((day, index) => (
            <article className="archive-card" key={day.date}>
              <div className="archive-card-top">
                <span className="calendar-icon">
                  <CalendarDays size={21} />
                </span>
                <span className="archive-tag">
                  {index === 0 ? 'ONTEM' : formatDate(day.date, { weekday: 'long' }).toUpperCase()}
                </span>
              </div>
              <h3>{formatDate(day.date)}</h3>
              <p>
                {formatDate(day.date, { year: 'numeric' })} <span>·</span> 5 desafios para explorar
              </p>
              <div className="archive-challenges">
                {day.challenges
                  .filter((challenge) => filter === 'all' || challenge.mode === filter)
                  .map((challenge) => (
                    <button key={challenge.id} onClick={() => onSelect(challenge)}>
                      <span>
                        <i className={`difficulty-dot ${challenge.difficulty}`} />
                        {challenge.mode === 'code'
                          ? difficultyNames[challenge.difficulty]
                          : modeNames[challenge.mode]}
                      </span>
                      {challenge.status === 'won' ? (
                        <Check size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </button>
                  ))}
              </div>
              <span className="archive-footer">
                TREINO LIVRE <span>SEM PONTOS</span>
              </span>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function RankingPage({
  profile,
  onLogin,
  onEditProfile,
  local,
}: {
  profile: Profile | null;
  onLogin: () => void;
  onEditProfile: () => void;
  local: boolean;
}) {
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setRanking(null);
    setError('');
    void api<Ranking>(`/ranking?period=${period}`)
      .then((result) => {
        if (alive) setRanking(result);
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [period, profile?.id, profile?.name, profile?.avatarUrl, retry]);
  const entries =
    ranking?.entries.filter((row) => row.name.toLowerCase().includes(search.toLowerCase())) || [];
  return (
    <>
      <div className="page-hero">
        <span className="eyebrow">
          <Trophy size={14} /> CADA DESCOBERTA CONTA
        </span>
        <h1>
          Conhecimento que
          <br />
          sobe no ranking<span>.</span>
        </h1>
        <p>
          Cinco tentativas, muitas possibilidades. Acompanhe quem
          <br className="desktop-break" /> está reconhecendo as pistas e conquistando o topo.
        </p>
      </div>
      <div className="ranking-layout">
        <section className="ranking-card">
          <div className="ranking-controls">
            <div className="segmented" aria-label="Período do ranking">
              <button
                className={period === 'month' ? 'selected' : ''}
                aria-pressed={period === 'month'}
                onClick={() => setPeriod('month')}
              >
                Mensal
              </button>
              <button
                className={period === 'all' ? 'selected' : ''}
                aria-pressed={period === 'all'}
                onClick={() => setPeriod('all')}
              >
                Geral
              </button>
            </div>
            <span>
              {period === 'month' && ranking
                ? formatDate(`${ranking.month}-01`, { month: 'long', year: 'numeric' })
                : 'Todas as edições'}
            </span>
          </div>
          <div className="ranking-search">
            <Search size={17} />
            <input
              aria-label="Buscar jogador entre os 100 primeiros"
              placeholder="Buscar entre os 100 primeiros"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {error ? (
            <div className="feedback error" role="alert">
              {error}{' '}
              <button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
            </div>
          ) : !ranking ? (
            <div className="loading-inline">
              <LoaderCircle className="spin" /> Carregando ranking…
            </div>
          ) : ranking.entries.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Posição</th>
                    <th>Jogador</th>
                    <th>Acertos</th>
                    <th>Pontos</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className={entry.isYou ? 'your-row' : ''}>
                      <td>
                        <span className={`rank-position place-${entry.position}`}>
                          {entry.position <= 3 ? <Medal size={19} /> : '#'}
                          {entry.position}
                        </span>
                      </td>
                      <td>
                        <span className="table-player">
                          <Avatar name={entry.name} url={entry.avatarUrl} />
                          {entry.name}
                          {entry.isYou && <small>você</small>}
                        </span>
                      </td>
                      <td>{entry.wins}</td>
                      <td>
                        <strong>{formatNumber(entry.points)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!entries.length && (
                <p className="table-no-results">Nenhum jogador encontrado nessa lista.</p>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <Trophy size={38} strokeWidth={1.5} />
              <h3>O primeiro lugar está livre.</h3>
              <p>
                Acerte um desafio conectado à sua conta
                <br />e seja o primeiro a aparecer por aqui.
              </p>
              <a className="button primary" href="#daily">
                Jogar desafio do dia <ArrowRight size={16} />
              </a>
            </div>
          )}
          <div className="ranking-footer">
            {ranking?.players || 0} jogadores com pontos{' '}
            <span>{local ? 'Ranking do ambiente local' : 'Atualizado a cada resultado'}</span>
          </div>
        </section>
        <aside className="side-stack">
          <section className="side-card your-position">
            <div className="card-eyebrow">
              <Trophy size={16} /> SEU LUGAR AQUI
            </div>
            {profile ? (
              <>
                <span className="large-stat">
                  {ranking?.own ? `#${ranking.own.position}` : '—'}
                </span>
                <h3>{profile.name}</h3>
                <button className="text-link" onClick={onEditProfile}>
                  Editar nome público
                </button>
                <p>
                  {ranking?.own
                    ? `${formatNumber(ranking.own.points)} pontos · ${ranking.own.wins} acertos`
                    : 'Seu próximo acerto pode abrir caminho.'}
                </p>
              </>
            ) : (
              <>
                <h3>Entre para a disputa.</h3>
                <p>Conecte sua conta e transforme seus acertos em pontos.</p>
                <button className="button secondary" onClick={onLogin}>
                  Entrar na minha conta <ArrowRight size={16} />
                </button>
              </>
            )}
          </section>
          <section className="side-card">
            <div className="card-eyebrow">COMO SUBIR NO RANKING</div>
            <ol className="steps-list">
              <li>
                <span>1</span>
                <div>
                  <strong>Encontre as pistas</strong>
                  <p>Desafios difíceis valem mais.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Acerte com precisão</strong>
                  <p>Menos tentativas, mais pontos.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Jogue no seu ritmo</strong>
                  <p>O tempo não altera a pontuação.</p>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
