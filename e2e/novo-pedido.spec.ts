import { expect, test } from '@playwright/test';

test('novo pedido em tela de 360px: combo + carne, retirada, pix, comanda', async ({ page }) => {
  await page.goto('/novo');
  await page.getByPlaceholder('(51) 99999-9999').fill(`5199${Math.floor(1000000 + Math.random() * 8999999)}`);
  await page.getByPlaceholder('Nome do cliente').fill('Cliente E2E');
  await page.getByRole('button', { name: 'Retirada' }).click();

  await page.getByRole('button', { name: /Combo 1/ }).click();
  await page.getByRole('button', { name: /Costela/ }).click();
  await page.getByRole('button', { name: 'Coca' }).click();

  await page.getByRole('button', { name: 'Carnes' }).click();
  await page.getByRole('button', { name: /Picanha/ }).click();
  await page.getByRole('listitem').filter({ hasText: 'Picanha' }).getByRole('button', { name: 'mais' }).click();

  await expect(page.getByText('R$ 367,99').last()).toBeVisible(); // 149,99 + 2 × 109,00
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  await expect(page.getByRole('heading', { name: /confirmado/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Imprimir comanda' })).toBeVisible();
});
