import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { openDatabase, migrate, type Database } from '../server/db.js';
import { seedDemo } from '../server/seed.js';
import { createApp } from '../server/app.js';
import type { Bootstrap, Game } from '../shared/contracts.js';

let db: Database;
let app: ReturnType<typeof createApp>;
let clock = new Date('2026-09-25T15:00:00Z');
const options = {
  production: false,
  localAuth: true,
  supabaseUrl: '',
  supabaseKey: '',
  origin: 'http://localhost:5173',
  rateLimits: false,
  clock: () => clock,
};
const send = (
  agent: ReturnType<typeof request.agent>,
  game: Game,
  answer: string,
  requestId = randomUUID(),
) => agent.post(`/api/sessions/${game.id}/guesses`).send({ answer, requestId });
async function start(agent: ReturnType<typeof request.agent>, mode = 'code', difficulty = 'easy') {
  const boot: Bootstrap = (await agent.get('/api/bootstrap').expect(200)).body;
  const daily = boot.challenges.find((row) => row.mode === mode && row.difficulty === difficulty)!;
  return (await agent.post('/api/sessions').send({ dailyId: daily.id }).expect(200)).body as Game;
}

before(async () => {
  db = await openDatabase('', false, 'memory://');
  await migrate(db);
  await migrate(db); // migrações repetidas são inofensivas
  await seedDemo(db, clock);
  app = createApp(db, options);
});
after(async () => {
  await db.close();
});

test('contratos públicos não incluem gabarito, relação, aliases ou chaves editoriais', async () => {
  const agent = request.agent(app);
  const boot: Bootstrap = (await agent.get('/api/bootstrap').expect(200)).body;
  assert.equal(boot.challenges.length, 5);
  assert.equal(boot.profile, null);
  assert.deepEqual(
    Object.keys(boot.challenges[0]).sort(),
    ['id', 'date', 'mode', 'difficulty', 'maxPoints', 'status', 'points'].sort(),
  );
  const game = await start(agent);
  assert.ok(game.content.includes('const scores'));
  assert.equal(game.ranked, false);
  assert.deepEqual(
    Object.keys(game).sort(),
    [
      'id',
      'dailyId',
      'date',
      'mode',
      'difficulty',
      'content',
      'status',
      'ranked',
      'startedAt',
      'finishedAt',
      'serverTime',
      'points',
      'maxPoints',
      'attemptsLeft',
      'guesses',
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(game),
    /javascript|typescript|language_id|source_note|editorial_key|accepted_answers/i,
  );
  const archive = (await agent.get('/api/archive').expect(200)).body;
  assert.equal(archive.days.length, 7);
  assert.doesNotMatch(
    JSON.stringify(archive),
    /source_code|normalized_text|snippet_id|content|javascript/i,
  );
});

test('visitante joga de verdade, sem pontos; refresh preserva tentativas e horário', async () => {
  const agent = request.agent(app);
  const game = await start(agent);
  const invalid = await send(agent, game, 'Não existe').expect(422);
  assert.match(invalid.body.error, /linguagem/);
  const wrong = (await send(agent, game, 'Ruby').expect(200)).body as Game;
  assert.equal(wrong.attemptsLeft, 2);
  await send(agent, game, 'RB').expect(409);
  const resumed = await start(agent);
  assert.equal(resumed.id, game.id);
  assert.equal(resumed.startedAt, game.startedAt);
  assert.equal(resumed.attemptsLeft, 2);
  const won = (await send(agent, game, ' JAVASCRIPT ').expect(200)).body as Game;
  assert.equal(won.status, 'won');
  assert.equal(won.points, 0);
  await send(agent, game, 'Python').expect(409);
  assert.equal((await start(agent)).id, game.id);
});

test('três erros encerram a partida sem revelar resposta; sessões são privadas', async () => {
  const agent = request.agent(app);
  const other = request.agent(app);
  const game = await start(agent, 'code', 'hard');
  await send(other, game, 'Julia').expect(404);
  for (const answer of ['Python', 'Java', 'C++']) await send(agent, game, answer).expect(200);
  const result = await start(agent, 'code', 'hard');
  assert.equal(result.status, 'lost');
  assert.equal(result.attemptsLeft, 0);
  assert.doesNotMatch(JSON.stringify(result), /julia|language_id|correctAnswer/i);
  await send(agent, game, 'Julia').expect(409);
});

test('envios diferentes concorrentes não ultrapassam três tentativas', async () => {
  const agent = request.agent(app);
  const game = await start(agent);
  const responses = await Promise.all(
    ['Ruby', 'Python', 'C++', 'Java'].map((answer) => send(agent, game, answer)),
  );
  assert.deepEqual(responses.map((result) => result.status).sort(), [200, 200, 200, 409]);
  const result = await start(agent);
  assert.equal(result.status, 'lost');
  assert.equal(result.guesses.length, 3);
  assert.equal(result.attemptsLeft, 0);
});

test('conta local: ponto atômico, tentativa idempotente e requisições concorrentes', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/local').send({}).expect(200);
  const boot: Bootstrap = (await agent.get('/api/bootstrap')).body;
  const daily = boot.challenges.find(
    (challenge) => challenge.mode === 'code' && challenge.difficulty === 'easy',
  )!;
  const [a, b] = await Promise.all([
    agent.post('/api/sessions').send({ dailyId: daily.id }),
    agent.post('/api/sessions').send({ dailyId: daily.id }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.id, b.body.id);
  const game: Game = a.body;
  clock = new Date('2026-09-25T15:01:00Z');
  const requestId = randomUUID();
  const results = await Promise.all([
    send(agent, game, 'js', requestId),
    send(agent, game, 'js', requestId),
  ]);
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.equal(result.body.points, 113);
    assert.equal(result.body.guesses.length, 1);
  }
  await send(agent, game, 'Python', requestId).expect(409);
  const events = await db.query('SELECT * FROM game.score_events WHERE session_id=$1', [game.id]);
  assert.equal(events.rows.length, 1);
  const afterBoot: Bootstrap = (await agent.get('/api/bootstrap')).body;
  assert.equal(afterBoot.profile?.totalPoints, 113);
  assert.equal(afterBoot.profile?.monthlyPoints, 113);
  const ranking = (await agent.get('/api/ranking?period=month').expect(200)).body;
  assert.equal(ranking.own.points, 113);
  assert.equal(ranking.entries[0].position, 1);
});

test('sigla aceita formatação, exige termo completo; framework usa aliases', async () => {
  const agent = request.agent(app);
  const acronym = await start(agent, 'acronym', 'standard');
  assert.equal(acronym.content, 'SaaS');
  const wrong = (await send(agent, acronym, 'Software Service').expect(200)).body;
  assert.equal(wrong.status, 'playing');
  const won = (await send(agent, acronym, ' SOFTWARE-as   a Service! ').expect(200)).body;
  assert.equal(won.status, 'won');
  const framework = await start(agent, 'framework', 'standard');
  assert.equal(framework.content, 'Django');
  assert.equal((await send(agent, framework, 'PY').expect(200)).body.status, 'won');
});

test('treino autenticado pode ser refeito e nunca altera a pontuação', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/local').send({}).expect(200);
  const beforeBoot: Bootstrap = (await agent.get('/api/bootstrap')).body;
  const archive = (await agent.get('/api/archive')).body;
  const daily = archive.days[0].challenges.find(
    (challenge: { mode: string }) => challenge.mode === 'acronym',
  );
  const game: Game = (await agent.post('/api/sessions').send({ dailyId: daily.id })).body;
  assert.equal(game.ranked, false);
  assert.equal(game.content, 'API');
  const result = (await send(agent, game, 'Application Programming Interface').expect(200)).body;
  assert.equal(result.status, 'won');
  assert.equal(result.points, 0);
  const replay: Game = (
    await agent.post('/api/sessions').send({ dailyId: daily.id, restart: true }).expect(200)
  ).body;
  assert.notEqual(replay.id, game.id);
  assert.equal(replay.attemptsLeft, 3);
  const afterBoot: Bootstrap = (await agent.get('/api/bootstrap')).body;
  assert.equal(afterBoot.profile?.totalPoints, beforeBoot.profile?.totalPoints);
});

test('cliente não pode forjar pontos, tentativa, tempo, identidade ou desafio futuro', async () => {
  const agent = request.agent(app);
  const game = await start(agent);
  await agent
    .post(`/api/sessions/${game.id}/guesses`)
    .send({ answer: 'js', requestId: randomUUID(), points: 99999 })
    .expect(400);
  await agent.post('/api/sessions').send({ dailyId: game.dailyId, ranked: true }).expect(400);
  await agent
    .post(`/api/sessions/${game.id}/guesses`)
    .send({ answer: 'a'.repeat(161), requestId: randomUUID() })
    .expect(400);
  await agent
    .post('/api/sessions')
    .set('Origin', 'https://other.example')
    .send({ dailyId: game.dailyId })
    .expect(403);
  await agent.get('/api/bootstrap').set('Authorization', 'Bearer forged').expect(401);
  await agent.get('/api/ranking?period=anything').expect(400);
  const {
    rows: [future],
  } = await db.query<{ id: string }>(
    `INSERT INTO game.daily_challenges(day,slot,challenge_id)
    SELECT '2099-01-01','code-easy',challenge_id FROM game.daily_challenges WHERE id=$1 RETURNING id`,
    [game.dailyId],
  );
  await agent.post('/api/sessions').send({ dailyId: future.id }).expect(404);
});

test('virada de mês expira partida antiga, mantém geral e zera mensal', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/local').send({}).expect(200);
  const game = await start(agent, 'code', 'medium');
  clock = new Date('2026-10-01T03:00:00Z');
  const expired = (await send(agent, game, 'Ruby').expect(200)).body;
  assert.equal(expired.status, 'expired');
  assert.equal(expired.points, 0);
  const boot: Bootstrap = (await agent.get('/api/bootstrap')).body;
  assert.equal(boot.profile?.totalPoints, 113);
  assert.equal(boot.profile?.monthlyPoints, 0);
  assert.equal((await agent.get('/api/ranking?period=month')).body.entries.length, 0);
  assert.equal((await agent.get('/api/ranking?period=all')).body.entries[0].points, 113);
});

test('produção desativa login local mesmo com flag ligada', async () => {
  const prodApp = createApp(db, { ...options, production: true, localAuth: true });
  const agent = request.agent(prodApp);
  await agent.post('/api/auth/local').send({}).expect(404);
  const boot: Bootstrap = (await agent.get('/api/bootstrap').expect(200)).body;
  assert.equal(boot.config.localAuth, false);
});

test('uma chave privilegiada do Supabase nunca pode virar configuração pública', () => {
  assert.throws(
    () =>
      createApp(db, {
        ...options,
        supabaseUrl: 'https://example.supabase.co',
        supabaseKey: 'sb_secret_example',
      }),
    /publicável/,
  );
  const privileged = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.throws(
    () =>
      createApp(db, {
        ...options,
        supabaseUrl: 'https://example.supabase.co',
        supabaseKey: privileged,
      }),
    /publicável/,
  );
});
