import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequestPath, startupCode } from '../api/index.js';

test('roteamento da função preserva caminho e parâmetros da API', () => {
  assert.equal(apiRequestPath('/api/index?route=bootstrap'), '/api/bootstrap');
  assert.equal(
    apiRequestPath('/api/index?route=ranking&period=month'),
    '/api/ranking?period=month',
  );
  assert.equal(
    apiRequestPath('/api/index?route=sessions/123/guesses'),
    '/api/sessions/123/guesses',
  );
  assert.equal(apiRequestPath('/api/index?route=../server'), null);
  assert.equal(apiRequestPath('/api/index'), null);
});

test('diagnóstico de inicialização não devolve credenciais ou detalhes do banco', () => {
  assert.equal(
    startupCode(Object.assign(new Error('senha privada'), { code: '28P01' })),
    'DATABASE_AUTH',
  );
  assert.equal(
    startupCode(Object.assign(new Error('host privado'), { code: 'ENETUNREACH' })),
    'DATABASE_NETWORK',
  );
  assert.equal(
    startupCode(
      Object.assign(new Error('certificado privado'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }),
    ),
    'DATABASE_TLS',
  );
  assert.equal(
    startupCode(Object.assign(new Error('schema privado'), { code: '42P01' })),
    'DATABASE_SCHEMA',
  );
});
