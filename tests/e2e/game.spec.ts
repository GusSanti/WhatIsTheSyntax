import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('jornada de visitante, editor sem metadados, navegação e treino', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Você conhece essa linguagem?' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar desafio', exact: true }).click();
  await expect(page.locator('.code-editor code')).toBeVisible();
  await expect(page.locator('.code-editor code')).toContainText('const scores');
  expect(await page.locator('.code-editor').innerHTML()).not.toMatch(
    /javascript|typescript|language-|data-lang|data-language|\.js\b/i,
  );
  await expect(page.locator('#answer')).toBeEnabled();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-daily.png`,
    fullPage: true,
  });
  await page.locator('#answer').fill('JavaScript');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText('Boa! Você reconheceu as pistas.')).toBeVisible();
  await expect(page.getByText('Sem pontuação', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Retomar desafio', exact: true }).click();
  await expect(page.getByText('Boa! Você reconheceu as pistas.')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Siglas', exact: true }).click();
  await page.getByRole('button', { name: 'Começar desafio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SaaS', exact: true })).toBeVisible();
  await page.locator('#answer').fill('SOFTWARE AS A SERVICE');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText('Boa! Você reconheceu as pistas.')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Frameworks', exact: true }).click();
  await page.getByRole('button', { name: 'Começar desafio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Django', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Arquivo', exact: true }).click();
  await expect(page.locator('.archive-card')).toHaveCount(7);
  await page
    .locator('.archive-card')
    .first()
    .getByRole('button', { name: 'Siglas', exact: true })
    .click();
  await page.getByRole('button', { name: 'Começar desafio', exact: true }).click();
  await page.locator('#answer').fill('Application Programming Interface');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Treinar novamente' })).toBeVisible();
  await page.getByRole('button', { name: 'Treinar novamente' }).click();
  await expect(page.locator('#answer')).toBeEnabled();
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mensal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Geral', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Geral', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-ranking.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('servidor de desenvolvimento bloqueia arquivos privados fora da interface', async ({
  request,
}) => {
  for (const path of ['server/seed.ts', 'database/migrations/001_initial.sql', '.env.example']) {
    const response = await request.get(`/@fs/${resolve(path).replaceAll('\\', '/')}`);
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toMatch(/const scores|CREATE TABLE game|DATABASE_URL=/);
  }
});

test('modal acessível e conta local para revisar o ranking', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuar com Google/ })).toBeDisabled();
  await page.getByRole('button', { name: /Usar conta de demonstração/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Conta local', { exact: true })).toBeAttached();
  await page.getByRole('navigation').getByRole('link', { name: 'Siglas', exact: true }).click();
  const start = page.getByRole('button', { name: /^(Começar|Retomar) desafio$/ });
  await start.click();
  if (await page.locator('#answer').isEnabled()) {
    await page.locator('#answer').fill('Software as a Service');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  }
  await expect(page.getByText('Boa! Você reconheceu as pistas.')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  const publicName = testInfo.project.name === 'mobile' ? 'Curioso Mobile' : 'Curioso Desktop';
  await page.getByRole('button', { name: 'Editar nome público' }).first().click();
  await page.getByRole('textbox', { name: 'Nome público' }).fill(publicName);
  await page.getByRole('button', { name: 'Salvar nome' }).click();
  await expect(page.locator('.your-row')).toContainText(publicName);
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
});
