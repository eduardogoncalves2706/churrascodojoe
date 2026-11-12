import { expect, test } from '@playwright/test';

test('cadastro de vendedor: cria, aparece na lista, edita o percentual', async ({ page }) => {
  await page.goto('/vendedores');
  await expect(page.getByRole('heading', { name: 'Vendedores e comissão' })).toBeVisible();

  const nome = `Vendedor E2E ${Date.now()}`;
  const codigo = `E2E${Date.now()}`;
  await page.getByPlaceholder('Nome do vendedor').fill(nome);
  await page.getByPlaceholder('Código do vendedor').fill(codigo);
  await page.getByPlaceholder('Valor da comissão').fill('8');
  await page.getByRole('button', { name: 'Adicionar' }).click();

  const linha = page.getByRole('row').filter({ hasText: nome });
  await expect(linha).toBeVisible();
  await expect(linha.getByText(codigo)).toBeVisible();

  const valor = linha.locator('input[inputmode="decimal"]');
  await valor.fill('12');
  await valor.blur();
  await page.waitForTimeout(300); // onBlur dispara o PATCH; sem indicador de "salvo" nessa tela
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: nome }).locator('input[inputmode="decimal"]')).toHaveValue('12.00');
});
