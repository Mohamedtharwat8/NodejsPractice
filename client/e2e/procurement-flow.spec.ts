import { expect, test } from '@playwright/test';

test('requester to approver to purchase order flow', async ({ page }) => {
  page.on('pageerror', (error) => console.error('BROWSER PAGE ERROR:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('BROWSER CONSOLE:', message.text()); });
  let request: any;
  let order: any;
  const vendor = { id: 9, name: 'Northwind Supply', email: 'sales@northwind.test', status: 'ACTIVE', createdAt: new Date().toISOString() };

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/v1/purchase-requests' && method === 'POST') {
      const body = route.request().postDataJSON();
      request = { ...body, id: 101, requesterId: 1, requester: { id: 1, name: 'Rita Requester', email: 'requester@example.com' }, status: 'DRAFT', totalAmount: 1800, createdAt: new Date().toISOString(), order: null };
      return json(request, 201);
    }
    if (url.pathname === '/api/v1/purchase-requests' && method === 'GET') {
      const status = url.searchParams.get('status');
      return json({ data: request && (!status || request.status === status) ? [request] : [], total: request ? 1 : 0 });
    }
    if (url.pathname === '/api/v1/purchase-requests/101' && method === 'GET') return json(request);
    if (url.pathname.endsWith('/101/submit')) { request.status = 'SUBMITTED'; return json(request); }
    if (url.pathname.endsWith('/101/approve')) { request.status = 'APPROVED'; return json(request); }
    if (url.pathname === '/api/v1/vendors') return json({ data: [vendor], total: 1 });
    if (url.pathname === '/api/v1/purchase-orders' && method === 'GET') return json({ data: order ? [order] : [], total: order ? 1 : 0 });
    if (url.pathname === '/api/v1/purchase-orders' && method === 'POST') { order = { id: 71, prId: 101, vendorId: 9, poNumber: 'PO-2026-0001', status: 'ISSUED', issuedAt: new Date().toISOString(), pr: request, vendor }; request.order = order; return json(order, 201); }
    return json({ data: [] });
  });

  const signInAs = async (id: number, name: string, role: string) => page.evaluate(({ id, name, role }) => {
    localStorage.setItem('procurement.token', 'browser-test-token');
    localStorage.setItem('procurement.user', JSON.stringify({ id, tenantId: 1, name, email: `${role.toLowerCase()}@example.com`, role }));
  }, { id, name, role });

  await page.goto('/login');
  await signInAs(1, 'Rita Requester', 'REQUESTER');
  await page.goto('/requests/new');
  await page.getByLabel('Request title').fill('Developer laptop');
  await page.getByLabel('Description').fill('Developer laptop');
  await page.getByLabel('Unit price').fill('1800');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.getByText('Developer laptop').click();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('SUBMITTED')).toBeVisible();

  await signInAs(2, 'Alex Approver', 'APPROVER');
  await page.goto('/approvals');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Approve request' }).click();
  await expect(page.getByText('You’re all caught up')).toBeVisible();

  await signInAs(3, 'Priya Procurement', 'PROCUREMENT');
  await page.goto('/orders');
  await page.getByRole('button', { name: 'Issue order' }).click();
  await page.getByLabel('Approved request').selectOption('101');
  await page.getByLabel('Vendor').selectOption('9');
  await page.getByRole('button', { name: 'Issue order', exact: true }).last().click();
  await expect(page.getByText('PO-2026-0001')).toBeVisible();
});
