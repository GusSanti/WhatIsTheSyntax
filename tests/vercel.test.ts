import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequestPath } from '../api/index.js';

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
