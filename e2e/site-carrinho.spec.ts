import { expect, test } from '@playwright/test';

// Site público (localhost:4321, apontado pra API local — ver playwright.config.ts) com o carrinho
// ligado (config padrão do seed local: site_aceita_pedidos_site = true).
test('carrinho do site: adiciona produto, finaliza e cria pré-pedido', async ({ page }) => {
  await page.goto('http://localhost:4321/');

  await page.getByRole('button', { name: /Adicionar Picanha ao carrinho/i }).click();
  await expect(page.locator('#carrinho-dialog')).toBeVisible();
  await expect(page.locator('#carrinho-lista')).toContainText('Picanha');
  await expect(page.locator('#carrinho-badge')).toHaveText('1');

  await page.locator('#ci-nome').fill('Cliente E2E Site');
  await page.locator('#ci-telefone').fill(`5199${Math.floor(1000000 + Math.random() * 8999999)}`);
  await page.getByLabel('Retirada').check();
  await page.getByRole('button', { name: 'Finalizar pedido' }).click();

  await expect(page.locator('#carrinho-sucesso')).toBeVisible();
  await expect(page.locator('#carrinho-sucesso-texto')).toContainText('aguardando confirmação');
});
