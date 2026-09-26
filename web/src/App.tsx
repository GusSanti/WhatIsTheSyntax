import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Blocks,
  Braces,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Flame,
  History,
  LoaderCircle,
  LogOut,
  Pencil,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import type { ArchiveDay, Bootstrap, DailyChallenge, Difficulty, Profile } from '../../shared/contracts';
import { api, errorMessage, getAuth, RequestError, setAccessToken } from './api';
import { difficultyNames, formatDate, formatNumber } from './lib';
import { Modal } from './components/Modal';
import { Avatar } from './components/Avatar';
import { GameBoard } from './components/GameBoard';
import { ArchivePage, RankingPage } from './components/OtherPages';

const tabs = [
  { id: 'daily', label: 'Desafio do dia', Icon: Code2 },
  { id: 'acronym', label: 'Siglas', Icon: Braces },
  { id: 'framework', label: 'Frameworks', Icon: Blocks },
  { id: 'archive', label: 'Arquivo', Icon: History },
  { id: 'ranking', label: 'Ranking', Icon: Trophy },
];
const readPage = () => {
  const hash = window.location.hash.slice(1);
  return tabs.some((tab) => tab.id === hash) || hash.startsWith('practice/') ? hash : 'daily';
};

export default function App() {
  const [page, setPage] = useState(readPage);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [modal, setModal] = useState<'login' | 'rules' | 'profile' | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [practice, setPractice] = useState<DailyChallenge | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [resetOffset, setResetOffset] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const result = await api<Bootstrap>('/bootstrap');
      setBoot(result);
      setResetOffset(Date.parse(result.serverTime) - Date.now());
      setError('');
    } catch (error) {
      setError(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    let alive = true;
    let subscription: { unsubscribe(): void } | undefined;
    async function initialize() {
      try {
        let result = await api<Bootstrap>('/bootstrap');
        const auth = getAuth(result.config);
        if (auth) {
          const { data } = await auth.auth.getSession();
          setAccessToken(data.session?.access_token || null);
          if (data.session) {
            try {
              result = await api<Bootstrap>('/bootstrap');
            } catch (error) {
              if (!(error instanceof RequestError) || error.status !== 401) throw error;
              setAccessToken(null);
              await auth.auth.signOut({ scope: 'local' });
              result = await api<Bootstrap>('/bootstrap');
            }
          }
          subscription = auth.auth.onAuthStateChange((event, session) => {
            setAccessToken(session?.access_token || null);
            if (event !== 'INITIAL_SESSION')
              queueMicrotask(() => {
                if (alive) void refresh();
              });
          }).data.subscription;
        }
        if (alive) {
          setBoot(result);
          setResetOffset(Date.parse(result.serverTime) - Date.now());
        } else subscription?.unsubscribe();
      } catch (error) {
        if (alive) setError(errorMessage(error));
      }
    }
    void initialize();
    const onHash = () => {
      setPage(readPage());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onHash);
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      alive = false;
      subscription?.unsubscribe();
      clearInterval(timer);
      window.removeEventListener('hashchange', onHash);
    };
  }, [refresh]);
  useEffect(() => {
    if (!boot) return;
    const remaining = Date.parse(boot.nextReset) - Date.now() - resetOffset;
    const timer = setTimeout(() => void refresh(), Math.max(1000, remaining + 500));
    return () => clearTimeout(timer);
  }, [boot?.nextReset, resetOffset, refresh]);
  useEffect(() => {
    if (!page.startsWith('practice/')) return;
    let alive = true;
    const id = page.slice(9);
    if (practice?.id === id) return;
    setPractice(null);
    void api<{ days: ArchiveDay[] }>('/archive')
      .then((result) => {
        if (!alive) return;
        const selected = result.days
          .flatMap((day) => day.challenges)
          .find((challenge) => challenge.id === id);
        if (selected) setPractice(selected);
        else setError('Essa edição não está disponível no arquivo.');
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [page, practice?.id]);
  const navigate = (target: string) => {
    window.location.hash = target;
  };
  const openLogin = () => {
    setAuthError('');
    setModal('login');
  };
  const openProfile = () => {
    setProfileName(boot?.profile?.name || '');
    setProfileError('');
    setModal('profile');
  };
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    try {
      const result = await api<{ profile: Profile }>('/profile', { name: profileName });
      setBoot((current) => current && { ...current, profile: result.profile });
      setModal(null);
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setProfileBusy(false);
    }
  }
  const choosePractice = (challenge: DailyChallenge) => {
    setPractice(challenge);
    navigate(`practice/${challenge.id}`);
  };
  async function login(local: boolean) {
    setAuthBusy(true);
    setAuthError('');
    try {
      if (local) {
        await api('/auth/local', {});
        await refresh();
        setModal(null);
      } else {
        const auth = getAuth();
        if (!auth) return;
        const { error } = await auth.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }
  async function logout() {
    setAuthBusy(true);
    try {
      if (getAuth()) await getAuth()!.auth.signOut();
      setAccessToken(null);
      await api('/auth/logout', {});
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }
  const isPractice = page.startsWith('practice/');
  const selected = isPractice
    ? practice
    : boot?.challenges.find((challenge) =>
        page === 'daily'
          ? challenge.mode === 'code' && challenge.difficulty === difficulty
          : challenge.mode === page,
      );
  const completed =
    boot?.challenges.filter(
      (challenge) => challenge.status === 'won' || challenge.status === 'lost',
    ).length || 0;
  const dailyPoints =
    boot?.challenges.reduce((total, challenge) => total + challenge.points, 0) || 0;
  const resetSeconds = boot
    ? Math.max(0, Math.floor((Date.parse(boot.nextReset) - clock - resetOffset) / 1000))
    : 0;
  const resetTime = [
    Math.floor(resetSeconds / 3600),
    Math.floor((resetSeconds % 3600) / 60),
    resetSeconds % 60,
  ]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  const gamePage = ['daily', 'acronym', 'framework'].includes(page) || isPractice;

  return (
    <>
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#daily" aria-label="What Is The Syntax? Início">
            <span className="brand-mark">
              <Code2 size={27} strokeWidth={2.1} />
            </span>
            <span>
              what is
              <br />
              <strong>
                the syntax<span>?</span>
              </strong>
            </span>
          </a>
          <div className="header-center">UM POUCO DE CÓDIGO. TODOS OS DIAS.</div>
          <div className="header-actions">
            <button
              className="icon-button help-button"
              aria-label="Como jogar"
              onClick={() => setModal('rules')}
            >
              <CircleHelp size={20} />
            </button>
            {boot?.profile ? (
              <>
                <button className="account-label account-button" onClick={openProfile} aria-label="Editar nome público">
                  <Avatar name={boot.profile.name} url={boot.profile.avatarUrl} />
                  <span>
                    {boot.profile.name}
                    <small>
                      {boot.profile.provider === 'local'
                        ? 'Conta local'
                        : `${formatNumber(boot.profile.totalPoints)} pontos`}
                    </small>
                  </span>
                  <Pencil size={13} className="account-pencil" />
                </button>
                <button
                  className="icon-button"
                  onClick={() => void logout()}
                  disabled={authBusy}
                  aria-label="Sair da conta"
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button className="button dark login-button" onClick={openLogin}>
                <UserRound size={16} /> Entrar <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          <div className="nav-inner">
            {tabs.map(({ id, label, Icon }) => (
              <a
                href={`#${id}`}
                key={id}
                className={page === id || (id === 'archive' && isPractice) ? 'active' : ''}
                aria-current={page === id || (id === 'archive' && isPractice) ? 'page' : undefined}
              >
                <Icon size={17} />
                {label}
                {id === 'daily' && <i className="nav-dot" />}
              </a>
            ))}
            <span className="nav-right">
              <span className="live-dot" /> Um novo desafio a cada dia
            </span>
          </div>
        </nav>
      </header>
      <main id="main" className="main-container">
        {error && (
          <div className="feedback error global-error" role="alert">
            <span>{error}</span>
            <button onClick={() => void refresh()}>Tentar novamente</button>
            <button aria-label="Fechar aviso" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {!boot ? (
          <div className="initial-loading">
            <LoaderCircle className="spin" size={28} />
            <p>Preparando o seu desafio…</p>
          </div>
        ) : (
          <>
            {page === 'ranking' && (
              <RankingPage
                profile={boot.profile}
                local={boot.config.storage === 'local'}
                onLogin={openLogin}
                onEditProfile={openProfile}
              />
            )}
            {page === 'archive' && <ArchivePage onSelect={choosePractice} />}
            {gamePage && (
              <>
                <div className="hero-row">
                  <div className="page-hero">
                    {isPractice ? (
                      <button className="back-link" onClick={() => navigate('archive')}>
                        <ArrowLeft size={14} /> Voltar ao arquivo
                      </button>
                    ) : (
                      <span className="eyebrow">
                        <span className="live-dot" /> SEU DESAFIO DIÁRIO DE TECNOLOGIA
                      </span>
                    )}
                    <h1>
                      {isPractice ? (
                        <>
                          Revisite as pistas<span>.</span>
                        </>
                      ) : page === 'daily' ? (
                        <>
                          Você conhece essa linguagem<span>?</span>
                        </>
                      ) : page === 'acronym' ? (
                        <>
                          Muito além das letras<span>.</span>
                        </>
                      ) : (
                        <>
                          Ligue os pontos<span>.</span>
                        </>
                      )}
                    </h1>
                    <p>
                      {isPractice ? (
                        'Uma nova chance de aprender. Sem pressa, sem pontos.'
                      ) : page === 'daily' ? (
                        <>
                          Observe o código, reconheça as pistas e descubra a linguagem.
                          <br className="desktop-break" /> Três tentativas. Uma nova descoberta
                          todos os dias.
                        </>
                      ) : page === 'acronym' ? (
                        <>
                          Você encontra essas siglas todos os dias.
                          <br className="desktop-break" /> Agora é hora de descobrir o que elas
                          querem dizer.
                        </>
                      ) : (
                        <>
                          Você conhece o nome. Mas conhece a linguagem?
                          <br className="desktop-break" /> Descubra a tecnologia por trás de cada
                          framework.
                        </>
                      )}
                    </p>
                  </div>
                  <div className="edition-stamp">
                    <CalendarDays size={19} />
                    <span>
                      {formatDate(isPractice && practice ? practice.date : boot.date, {
                        day: '2-digit',
                        month: 'short',
                      }).replace('.', '')}
                      <small>{isPractice ? 'EDIÇÃO ANTERIOR' : 'EDIÇÃO DE HOJE'}</small>
                    </span>
                  </div>
                </div>
                <div className="game-layout">
                  <div className="game-main">
                    {page === 'daily' && (
                      <div className="difficulty-tabs" role="group" aria-label="Dificuldade">
                        {(['easy', 'medium', 'hard'] as const).map((level) => {
                          const challenge = boot.challenges.find(
                            (challenge) =>
                              challenge.mode === 'code' && challenge.difficulty === level,
                          );
                          return (
                            <button
                              key={level}
                              className={difficulty === level ? 'selected' : ''}
                              aria-pressed={difficulty === level}
                              onClick={() => setDifficulty(level)}
                            >
                              <span>
                                <i className={`difficulty-dot ${level}`} />
                                {difficultyNames[level]}
                              </span>
                              <small>
                                {challenge?.status === 'won' ? (
                                  <Check size={14} />
                                ) : (
                                  `${level === 'easy' ? '125' : level === 'medium' ? '250' : '375'} pts`
                                )}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {page !== 'daily' && (
                      <div className="mode-heading">
                        <span className="mode-pill">
                          {isPractice ? <History size={14} /> : <Target size={14} />}
                          {isPractice ? 'Treino livre' : 'Dificuldade única'}
                        </span>
                        <span>
                          {isPractice
                            ? 'Refaça quantas vezes quiser'
                            : 'Um desafio por dia · até 125 pontos'}
                        </span>
                      </div>
                    )}
                    {selected ? (
                      <GameBoard
                        key={`${selected.id}:${boot.profile?.id || 'guest'}`}
                        challenge={selected}
                        languages={boot.languages}
                        signedIn={!!boot.profile}
                        practice={isPractice}
                        onUpdate={() => void refresh()}
                        onRules={() => setModal('rules')}
                        onLogin={openLogin}
                      />
                    ) : (
                      <div className="empty-state">
                        <CalendarDays size={35} />
                        <h3>
                          {isPractice
                            ? 'Carregando essa edição…'
                            : 'A próxima descoberta está a caminho.'}
                        </h3>
                        <p>
                          {isPractice
                            ? 'Buscando os dados do desafio.'
                            : 'Ainda não há um desafio publicado para este modo hoje.'}
                        </p>
                      </div>
                    )}
                  </div>
                  <aside className="side-stack daily-sidebar">
                    <section className="side-card daily-progress">
                      <div className="card-eyebrow">
                        <Flame size={17} /> UM POUCO MELHOR A CADA DIA
                      </div>
                      <h2>Seu progresso de hoje</h2>
                      <p>Uma descoberta de cada vez.</p>
                      <div className="daily-slots">
                        {boot.challenges.map((challenge, i) => (
                          <button
                            key={challenge.id}
                            className={
                              challenge.status === 'won'
                                ? 'done'
                                : challenge.status === 'lost'
                                  ? 'missed'
                                  : ''
                            }
                            aria-label={`${modeNamesForSlot(challenge)}${challenge.status === 'won' ? ', concluído' : ''}`}
                            onClick={() => {
                              if (challenge.mode === 'code') setDifficulty(challenge.difficulty);
                              navigate(challenge.mode === 'code' ? 'daily' : challenge.mode);
                            }}
                          >
                            {challenge.status === 'won' ? (
                              <Check size={20} />
                            ) : challenge.status === 'lost' ? (
                              <X size={20} />
                            ) : i < 3 ? (
                              <Code2 size={20} />
                            ) : i === 3 ? (
                              <Braces size={20} />
                            ) : (
                              <Blocks size={20} />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="progress-caption">
                        <span>
                          <strong>{completed}</strong> de {boot.challenges.length} concluídos
                        </span>
                        <span>
                          {Math.round((completed / (boot.challenges.length || 1)) * 100)}%
                        </span>
                      </div>
                      <div className="progress-track">
                        <span
                          style={{ width: `${(completed / (boot.challenges.length || 1)) * 100}%` }}
                        />
                      </div>
                      <div className="points-today">
                        <div>
                          <span>PONTOS HOJE</span>
                          <strong>
                            {formatNumber(dailyPoints)} <small>pts</small>
                          </strong>
                        </div>
                        <span className="trophy-circle">
                          <Trophy size={22} strokeWidth={1.5} />
                        </span>
                      </div>
                      <button className="text-link" onClick={() => navigate('ranking')}>
                        Ver ranking <ArrowRight size={15} />
                      </button>
                    </section>
                    <section className="side-card hint-card">
                      <span className="hint-icon">
                        <Sparkles size={20} />
                      </span>
                      <h3>O detalhe faz a diferença.</h3>
                      <p>
                        Chaves, palavras reservadas, indentação… Às vezes, a menor pista entrega a
                        resposta.
                      </p>
                      <button className="text-link" onClick={() => setModal('rules')}>
                        Entenda as regras <ArrowDownRight size={15} />
                      </button>
                    </section>
                    <div className="reset-card">
                      <span>PRÓXIMA DESCOBERTA EM</span>
                      <strong>{resetTime}</strong>
                      <small>Novos desafios à meia-noite de Brasília</small>
                    </div>
                  </aside>
                </div>
                <section className="explore-section">
                  <div className="section-heading">
                    <h2>
                      Continue curioso<span>.</span>
                    </h2>
                    <span>Mais jeitos de testar seu conhecimento</span>
                  </div>
                  <div className="explore-grid">
                    <button className="explore-card" onClick={() => navigate('acronym')}>
                      <span className="explore-icon peach">
                        <Braces size={24} />
                      </span>
                      <div>
                        <h3>Além da sigla</h3>
                        <p>Você sabe o que essas letras significam?</p>
                        <span>
                          SIGLAS <ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                    <button className="explore-card" onClick={() => navigate('framework')}>
                      <span className="explore-icon lavender">
                        <Blocks size={24} />
                      </span>
                      <div>
                        <h3>Por trás do framework</h3>
                        <p>Encontre a linguagem que conecta tudo.</p>
                        <span>
                          FRAMEWORKS <ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                    <button className="explore-card" onClick={() => navigate('archive')}>
                      <span className="explore-icon sage">
                        <History size={24} />
                      </span>
                      <div>
                        <h3>Praticar nunca é demais</h3>
                        <p>Volte no tempo. Descubra novas pistas.</p>
                        <span>
                          ARQUIVO DE DESAFIOS <ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <div>
          <span className="footer-brand">
            <Code2 size={20} /> what is the syntax?
          </span>
          <span>Feito para quem nunca para de aprender.</span>
        </div>
        <span>
          {boot?.config.storage === 'local'
            ? 'PRÉVIA LOCAL · CATÁLOGO DEMONSTRATIVO'
            : 'OBSERVE. DESCUBRA. REPITA AMANHÃ.'}
        </span>
      </footer>
      {modal === 'login' && (
        <Modal title="Seu conhecimento merece pontos." onClose={() => setModal(null)}>
          <p className="modal-description">
            Entre antes de começar um desafio para salvar seus resultados e participar do ranking.
          </p>
          <button
            className="button google-button"
            disabled={!boot?.config.supabase || authBusy}
            onClick={() => void login(false)}
          >
            <span className="google-letter">G</span> Continuar com Google{' '}
            {authBusy && <LoaderCircle size={16} className="spin" />}
          </button>
          {!boot?.config.supabase && (
            <p className="setup-note">
              O login Google estará disponível quando a conexão de autenticação do projeto for
              configurada.
            </p>
          )}
          {boot?.config.localAuth && (
            <div className="local-login">
              <span>EXPERIMENTE A PRIMEIRA VERSÃO</span>
              <p>
                A conta local permite revisar partidas e pontos neste ambiente de desenvolvimento.
              </p>
              <button
                className="button secondary"
                disabled={authBusy}
                onClick={() => void login(true)}
              >
                <UserRound size={16} /> Usar conta de demonstração <ChevronRight size={16} />
              </button>
            </div>
          )}
          {authError && (
            <div className="feedback error" role="alert">
              {authError}
            </div>
          )}
          <p className="modal-footnote">
            Prefere explorar? Todos os desafios podem ser jogados sem conta.
          </p>
        </Modal>
      )}
      {modal === 'profile' && boot?.profile && (
        <Modal title="Seu nome no ranking." onClose={() => setModal(null)}>
          <p className="modal-description">
            Escolha como os outros jogadores verão você. Seus pontos continuam ligados à sua conta.
          </p>
          <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
            <label htmlFor="public-name">Nome público</label>
            <input
              id="public-name"
              className="text-input"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              maxLength={24}
              autoComplete="nickname"
              required
              disabled={profileBusy}
            />
            <p>De 3 a 24 caracteres. Letras, números, espaços, ponto, hífen ou sublinhado.</p>
            {profileError && <div className="feedback error" role="alert">{profileError}</div>}
            <button className="button primary full-width" type="submit" disabled={profileBusy}>
              {profileBusy ? <LoaderCircle size={17} className="spin" /> : 'Salvar nome'}
            </button>
          </form>
        </Modal>
      )}
      {modal === 'rules' && (
        <Modal title="Reconheça as pistas." onClose={() => setModal(null)}>
          <p className="modal-description">
            Cinco desafios novos por edição: três linguagens, uma sigla e um framework.
          </p>
          <ol className="steps-list rules-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Escolha seu desafio</strong>
                <p>
                  Entre na sua conta antes de começar se quiser pontuar. O relógio começa quando a
                  pergunta é revelada e continua ao sair da aba.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Use suas três tentativas</strong>
                <p>
                  Selecione ou escreva a linguagem. Em siglas, escreva o significado em inglês.
                  Maiúsculas e espaços extras não atrapalham.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Cada acerto conta</strong>
                <p>
                  Base de 100 pontos no fácil, 200 no médio e 300 no difícil. Siglas e frameworks
                  têm base de 100. O bônus de rapidez cai de 25% a zero nos primeiros dois minutos.
                </p>
              </div>
            </li>
          </ol>
          <div className="rule-score">
            <span>
              1ª tentativa <strong>100%</strong>
            </span>
            <span>
              2ª tentativa <strong>70%</strong>
            </span>
            <span>
              3ª tentativa <strong>40%</strong>
            </span>
          </div>
          <p className="modal-footnote">
            A porcentagem é aplicada à base somada ao bônus, com arredondamento ao inteiro mais
            próximo. Treino e partidas sem conta não geram pontos. A edição muda à meia-noite no
            horário de Brasília.
          </p>
          <button className="button primary full-width" onClick={() => setModal(null)}>
            Vamos descobrir <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </>
  );
}

function modeNamesForSlot(challenge: DailyChallenge) {
  return challenge.mode === 'code'
    ? `Linguagem ${difficultyNames[challenge.difficulty]}`
    : challenge.mode === 'acronym'
      ? 'Siglas'
      : 'Frameworks';
}
