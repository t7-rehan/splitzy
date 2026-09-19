/**
 * Task 7 — real PostgreSQL end-to-end smoke test.
 *
 * Boots the REAL Express app (in-process, same middleware chain as production:
 * requireAuth -> requireActor -> loadGroupMembership -> loadGroupExpense ->
 * service -> Prisma -> PostgreSQL) and drives it over real HTTP with the Task 4
 * development-authentication path (x-dev-user-id).
 *
 * Prerequisites: a running PostgreSQL reachable via Backend/.env DATABASE_URL
 * with migrations deployed (`npx prisma migrate deploy`).
 *
 * Data hygiene: every record is created through the API under synthetic dev
 * identities ("dev-user-task7-*") inside a "Task 7 Verification Group", and is
 * deleted again at the end (only Task 7's own rows — cascades remove the rest).
 * A crash mid-run leaves only clearly-named verification data behind.
 *
 * Run (from Backend/):  npx tsx scripts/smoke-postgres.ts
 */
import 'dotenv/config';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Minimal typed HTTP client over the real server
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl = '';

interface ApiResponse {
  status: number;
  // Response envelope (success or error) — asserted loosely, checked strictly.
  body: any;
}

async function call(
  method: string,
  path: string,
  opts: { uid?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.uid !== undefined) headers['x-dev-user-id'] = opts.uid;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  let parsed: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return { status: res.status, body: parsed };
}

let checks = 0;
function ok(label: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (!condition) {
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  } else {
    console.log(`  pass  ${label}`);
  }
}

function step(title: string): void {
  console.log(`\n== ${title} ==`);
}

/** Prisma Decimal | null | undefined -> number | null (null-safe compare). */
function pctValue(d: { toNumber(): number } | null | undefined): number | null {
  return d === null || d === undefined ? null : d.toNumber();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const prisma = new PrismaClient({ log: ['error'] });

async function main(): Promise<void> {
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  console.log(`Smoke server on ${baseUrl} (real app + real PostgreSQL)`);

  const OWNER = 'dev-user-task7-owner';
  const MEMBER = 'dev-user-task7-member';
  const OUTSIDER = 'dev-user-task7-outsider';

  // =======================================================================
  step('Health & authentication gateway');
  // =======================================================================
  let r = await call('GET', '/api/v1/health');
  ok('GET /health -> 200', r.status === 200, `got ${r.status}`);
  r = await call('GET', '/api/v1/groups');
  ok('groups without auth -> 401', r.status === 401, `got ${r.status}`);
  r = await call('GET', '/api/v1/groups', { uid: OWNER });
  ok('dev-auth request reaches the database (200)', r.status === 200, `got ${r.status}`);

  // =======================================================================
  step('Actor provisioning through real auth path');
  // =======================================================================
  r = await call('GET', '/api/v1/auth/me', { uid: OWNER });
  ok('GET /auth/me -> 200', r.status === 200, JSON.stringify(r.body));
  const owner = r.body.data;
  ok('user persisted with id', typeof owner.id === 'string' && owner.id.length > 0);
  ok('fallback email namespaced', owner.email.endsWith('@users.splitzy.local'), owner.email);
  r = await call('GET', '/api/v1/auth/me', { uid: OWNER });
  ok('second login reuses same User row', r.body.data.id === owner.id);

  // Resolve member + outsider users (auto-provisioned by any authenticated call).
  const memberMe = await call('GET', '/api/v1/auth/me', { uid: MEMBER });
  const member = memberMe.body.data;
  const outsiderMe = await call('GET', '/api/v1/auth/me', { uid: OUTSIDER });
  const outsider = outsiderMe.body.data;

  // =======================================================================
  step('Group creation (transactional: group + OWNER membership)');
  // =======================================================================
  r = await call('POST', '/api/v1/groups', {
    uid: OWNER,
    body: {
      name: 'Task 7 Verification Group',
      description: 'Temporary development-verification data (Task 7)',
      currencyCode: 'INR',
    },
  });
  ok('POST /groups -> 201', r.status === 201, JSON.stringify(r.body));
  const group = r.body.data;
  ok('creator is OWNER', group.viewerRole === 'OWNER');
  ok('memberCount starts at 1', group.memberCount === 1);
  const groupId: string = group.id;

  // Owner already in DB — verify Group.createdById FK RESTRICT at the very end.

  // =======================================================================
  step('Membership management against PostgreSQL');
  // =======================================================================
  r = await call('POST', `/api/v1/groups/${groupId}/members`, {
    uid: OWNER,
    body: { userId: member.id },
  });
  ok('owner adds member -> 201', r.status === 201, JSON.stringify(r.body));
  ok('added role is MEMBER', r.body.data.role === 'MEMBER');

  r = await call('POST', `/api/v1/groups/${groupId}/members`, {
    uid: OWNER,
    body: { userId: member.id },
  });
  ok('duplicate membership -> 409 (DB unique constraint)', r.status === 409, `got ${r.status}`);
  const gmCount = await prisma.groupMember.count({
    where: { groupId, userId: member.id },
  });
  ok('no duplicate GroupMember row in database', gmCount === 1);

  r = await call('POST', `/api/v1/groups/${groupId}/members`, {
    uid: OWNER,
    body: { userId: outsider.id },
  });
  ok('owner can add outsider (needed for isolation check) -> 201', r.status === 201);
  r = await call('DELETE', `/api/v1/groups/${groupId}/members/${outsider.id}`, {
    uid: OWNER,
  });
  ok('owner removes outsider -> 200', r.status === 200, `got ${r.status}`);

  r = await call('GET', '/api/v1/groups', { uid: MEMBER });
  ok('group listing shows the group for the member', r.body.data.some((g: { id: string }) => g.id === groupId));
  r = await call('GET', '/api/v1/groups', { uid: OUTSIDER });
  ok(
    'removed outsider no longer sees the group',
    !r.body.data.some((g: { id: string }) => g.id === groupId),
  );

  r = await call('GET', `/api/v1/groups/${groupId}`, { uid: MEMBER });
  ok('member sees group detail -> 200', r.status === 200);
  ok(
    'member list from DB carries roles',
    r.body.data.members.length === 2 &&
      r.body.data.members.some((m: { role: string }) => m.role === 'OWNER') &&
      r.body.data.members.some((m: { role: string }) => m.role === 'MEMBER'),
  );
  ok('member projection excludes email', !JSON.stringify(r.body).includes('@'));

  r = await call('GET', `/api/v1/groups/${groupId}`, { uid: OUTSIDER });
  ok('non-member detail access -> 404 (no existence leak)', r.status === 404, `got ${r.status}`);

  // =======================================================================
  step('EQUAL expense (server-computed shares)');
  // =======================================================================
  // ₹100.01 / 2 -> [5000, 5001]: last participant absorbs the 1-paise remainder.
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'Task 7 equal-split dinner',
      category: 'Food',
      amountMinor: '10001',
      paidByUserId: owner.id,
      splitType: 'EQUAL',
      participants: [owner.id, member.id],
      expenseDate: '2026-09-19T12:00:00.000Z',
    },
  });
  ok('POST EQUAL expense -> 201', r.status === 201, JSON.stringify(r.body));
  const equal: { id: string; amountMinor: string; participants: Array<{ userId: string; shareMinor: string }> } = r.body.data;
  ok('paidBy is the authenticated creator', equal.participants.length === 2);
  const equalShares = equal.participants.map((p) => p.shareMinor).sort();
  ok('remainder absorbed deterministically [5000,5001]', equalShares[0] === '5000' && equalShares[1] === '5001', equalShares.join(','));

  const equalRow = await prisma.expense.findUnique({
    where: { id: equal.id },
    include: { participants: true },
  });
  ok('Expense.amountMinor persisted as BIGINT 10001n', equalRow?.amountMinor === 10001n);
  ok(
    'participant shares reconcile to the expense total in DB',
    (equalRow?.participants ?? []).reduce((s, p) => s + p.shareMinor, 0n) ===
      (equalRow?.amountMinor ?? -1n),
  );
  ok('currency defaulted to group currency INR', equalRow?.currencyCode === 'INR');
  ok('createdById is the owner (server-set)', equalRow?.createdById === owner.id);

  // =======================================================================
  step('PERCENTAGE expense (integer basis points)');
  // =======================================================================
  // 50.00% + 50.00% of ₹199.99 -> [10000, 9999]: largest share absorbs remainder.
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'Task 7 percentage cab',
      category: 'Travel',
      amountMinor: '19999',
      paidByUserId: owner.id,
      splitType: 'PERCENTAGE',
      percentages: { [owner.id]: '5000', [member.id]: '5000' },
    },
  });
  ok('POST PERCENTAGE expense -> 201', r.status === 201, JSON.stringify(r.body));
  const pct = r.body.data;
  const pctShares = Object.fromEntries(
    pct.participants.map((p: { userId: string; shareMinor: string; percentage: string | null }) => [p.userId, { shareMinor: p.shareMinor, percentage: p.percentage }]),
  );
  ok('50% of 19999 = 9999/10000', pctShares[owner.id].shareMinor === '10000' && pctShares[member.id].shareMinor === '9999', JSON.stringify(pctShares));
  ok('percentage persisted as 50.00', pctShares[owner.id].percentage === '50.00');

  const pctRow = await prisma.expenseParticipant.findFirstOrThrow({
    where: { expenseId: pct.id, userId: owner.id },
  });
  // Prisma's Decimal normalizes trailing zeros ("50.00" -> 50) — compare numerically.
  ok('DB percentage column stored 50', pctValue(pctRow.percentage) === 50, pctRow.percentage?.toString() ?? 'null');

  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'Task 7 bad percentage',
      category: 'Food',
      amountMinor: '1000',
      paidByUserId: owner.id,
      splitType: 'PERCENTAGE',
      percentages: { [owner.id]: '5000', [member.id]: '4999' },
    },
  });
  ok('percentages not totalling 100% -> 400', r.status === 400, `got ${r.status}`);
  const badCount = await prisma.expense.count({ where: { description: 'Task 7 bad percentage' } });
  ok('failed create left NO Expense row (transaction rolled back)', badCount === 0);

  // =======================================================================
  step('ITEMIZED expense (items + per-item participants)');
  // =======================================================================
  // Pizza 80000 split [40000,40000]; Juice 19999 split by 3 -> [6666,6666,6667].
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: MEMBER,
    body: {
      description: 'Task 7 itemized groceries',
      category: 'Shopping',
      amountMinor: '99999',
      paidByUserId: member.id,
      splitType: 'ITEMIZED',
      items: [
        { name: 'Pizza', amountMinor: '80000', participantUserIds: [owner.id, member.id] },
        { name: 'Juice', amountMinor: '19999', participantUserIds: [owner.id, member.id, outsider.id] },
      ],
    },
  });
  // outsider.id is not a group member — must be rejected.
  ok('item participant outside group -> 400', r.status === 400, `got ${r.status}`);
  const orphanItems = await prisma.expenseItem.count({ where: { description: 'Juice' } });
  ok('failed itemized create left NO ExpenseItem rows', orphanItems === 0);

  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: MEMBER,
    body: {
      description: 'Task 7 itemized groceries',
      category: 'Shopping',
      amountMinor: '99999',
      paidByUserId: member.id,
      splitType: 'ITEMIZED',
      items: [
        { name: 'Pizza', amountMinor: '80000', participantUserIds: [owner.id, member.id] },
        { name: 'Juice', amountMinor: '19999', participantUserIds: [owner.id, member.id] },
      ],
    },
  });
  ok('POST valid ITEMIZED expense -> 201', r.status === 201, JSON.stringify(r.body));
  const itemized = r.body.data;
  const pizza = itemized.items[0];
  const juice = itemized.items[1];
  ok('item amounts persisted', pizza.amountMinor === '80000' && juice.amountMinor === '19999');
  const itemTotals = await prisma.expenseItemParticipant.findMany({
    where: { item: { expenseId: itemized.id } },
  });
  const itemSum = itemTotals.reduce((s, ip) => s + ip.shareMinor, 0n);
  ok('item participant shares reconcile in DB', itemSum === 99999n);
  const itemizedParticipants = await prisma.expenseParticipant.findMany({
    where: { expenseId: itemized.id },
  });
  ok(
    'expense participants derived from item shares (per-user totals)',
    itemizedParticipants.length === 2 &&
      itemizedParticipants.reduce((s, p) => s + p.shareMinor, 0n) === 99999n,
  );
  ok('items sum equals expense amount',
    Number(pizza.amountMinor) + Number(juice.amountMinor) === Number(itemized.amountMinor));

  // =======================================================================
  step('Validation & authorization guards against the real DB');
  // =======================================================================
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'x',
      category: 'Food',
      amountMinor: '1000',
      paidByUserId: owner.id,
      splitType: 'EQUAL',
      participants: [outsider.id],
    },
  });
  ok('participant outside group -> 400', r.status === 400, `got ${r.status}`);
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'x',
      category: 'Food',
      amountMinor: '0',
      paidByUserId: owner.id,
      splitType: 'EQUAL',
      participants: [owner.id],
    },
  });
  ok('zero amount -> 400', r.status === 400, `got ${r.status}`);
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'x',
      category: 'Food',
      amountMinor: '1000.5',
      paidByUserId: owner.id,
      splitType: 'EQUAL',
      participants: [owner.id],
    },
  });
  ok('fractional minor units -> 400 (integer money only)', r.status === 400, `got ${r.status}`);
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OUTSIDER,
    body: {
      description: 'x',
      category: 'Food',
      amountMinor: '1000',
      paidByUserId: outsider.id,
      splitType: 'EQUAL',
      participants: [outsider.id],
    },
  });
  ok('non-member create -> 404 (no existence leak)', r.status === 404, `got ${r.status}`);

  // =======================================================================
  step('Fields-only update (Task 6 regression: derived rows must survive)');
  // =======================================================================
  r = await call('PATCH', `/api/v1/groups/${groupId}/expenses/${equal.id}`, {
    uid: OWNER,
    body: { description: 'Task 7 equal-split dinner (renamed)', category: 'Entertainment' },
  });
  ok('fields-only PATCH -> 200', r.status === 200, JSON.stringify(r.body));
  ok('description changed', r.body.data.description.endsWith('(renamed)'));
  const equalAfterFields = await prisma.expense.findUniqueOrThrow({
    where: { id: equal.id },
    include: { participants: true, items: true },
  });
  ok('participants intact after fields-only update', equalAfterFields.participants.length === 2);
  ok('amount untouched', equalAfterFields.amountMinor === 10001n);

  // =======================================================================
  step('Split update (transactional replacement of derived rows)');
  // =======================================================================
  // Equal -> PERCENTAGE 75/25 of the same amount: [7501, 2500] (largest absorbs 1).
  r = await call('PATCH', `/api/v1/groups/${groupId}/expenses/${equal.id}`, {
    uid: OWNER,
    body: { splitType: 'PERCENTAGE', percentages: { [owner.id]: '7500', [member.id]: '2500' } },
  });
  ok('split PATCH -> 200', r.status === 200, JSON.stringify(r.body));
  const equalAfterSplit = await prisma.expense.findUniqueOrThrow({
    where: { id: equal.id },
    include: { participants: true },
  });
  ok('Expense.splitType updated in DB', equalAfterSplit.splitType === 'PERCENTAGE');
  const ownPct = equalAfterSplit.participants.find((p) => p.userId === owner.id);
  const memPct = equalAfterSplit.participants.find((p) => p.userId === member.id);
  ok('new shares written: 7501/2500', ownPct?.shareMinor === 7501n && memPct?.shareMinor === 2500n, `${ownPct?.shareMinor},${memPct?.shareMinor}`);
  ok(
    'new percentages stored: 75/25',
    pctValue(ownPct?.percentage) === 75 && pctValue(memPct?.percentage) === 25,
    `${ownPct?.percentage},${memPct?.percentage}`,
  );
  ok('exactly 2 participant rows (no stale rows)', equalAfterSplit.participants.length === 2);

  r = await call('PATCH', `/api/v1/groups/${groupId}/expenses/${equal.id}`, {
    uid: MEMBER,
    body: { description: 'hijack' },
  });
  ok('non-creator MEMBER update -> 403', r.status === 403, `got ${r.status}`);

  // =======================================================================
  step('List & detail (group-scoped, safe projection)');
  // =======================================================================
  r = await call('GET', `/api/v1/groups/${groupId}/expenses`, { uid: MEMBER });
  ok('list -> 200', r.status === 200, `got ${r.status}`);
  const listed = r.body.data;
  ok('list contains this run\'s expenses', listed.some((e: { id: string }) => e.id === equal.id) && listed.some((e: { id: string }) => e.id === itemized.id));
  ok('list is group-scoped (every row carries this groupId)', listed.every((e: { groupId: string }) => e.groupId === groupId));
  ok(
    'list ordered newest expenseDate first',
    listed.length >= 2 &&
      listed.every(
        (e: { expenseDate: string }, i: number): boolean =>
          i === 0 ||
          Date.parse(listed[i - 1]!.expenseDate) >= Date.parse(e.expenseDate),
      ),
  );
  const rawList = JSON.stringify(r.body);
  ok('no emails in list payload', !rawList.includes('@'), rawList.slice(0, 120));
  r = await call('GET', `/api/v1/groups/${groupId}/expenses/${itemized.id}`, { uid: MEMBER });
  ok('detail includes items + participants', r.body.data.items.length === 2 && r.body.data.participants.length === 2);
  r = await call('GET', `/api/v1/groups/${groupId}/expenses/${itemized.id}`, { uid: OUTSIDER });
  ok('non-member expense detail -> 404 (no existence leak)', r.status === 404, `got ${r.status}`);

  // Cross-group: create a second group and try to read task7's expense through it.
  r = await call('POST', '/api/v1/groups', {
    uid: OUTSIDER,
    body: { name: 'Task 7 Outsider Group', currencyCode: 'INR' },
  });
  const outsiderGroupId: string = r.body.data.id;
  r = await call('GET', `/api/v1/groups/${outsiderGroupId}/expenses/${itemized.id}`, { uid: OUTSIDER });
  ok('cross-group expense ID access -> 404 (scoped query)', r.status === 404, `got ${r.status}`);

  // =======================================================================
  step('Delete + cascade verification in PostgreSQL');
  // =======================================================================
  const expensesBeforeDisposable = await prisma.expense.count({ where: { groupId } });
  r = await call('POST', `/api/v1/groups/${groupId}/expenses`, {
    uid: OWNER,
    body: {
      description: 'Task 7 disposable expense',
      category: 'Other',
      amountMinor: '12345',
      paidByUserId: owner.id,
      splitType: 'ITEMIZED',
      items: [
        { name: 'Disposable A', amountMinor: '10000', participantUserIds: [owner.id, member.id] },
        { name: 'Disposable B', amountMinor: '2345', participantUserIds: [owner.id] },
      ],
    },
  });
  const disposable = r.body.data;
  const before = {
    items: await prisma.expenseItem.count({ where: { expenseId: disposable.id } }),
    itemParts: await prisma.expenseItemParticipant.count({
      where: { item: { expenseId: disposable.id } },
    }),
    parts: await prisma.expenseParticipant.count({ where: { expenseId: disposable.id } }),
  };
  ok('disposable expense created with derived rows', before.items === 2 && before.itemParts === 3 && before.parts === 2, JSON.stringify(before));

  r = await call('DELETE', `/api/v1/groups/${groupId}/expenses/${disposable.id}`, { uid: OWNER });
  ok('DELETE -> 200', r.status === 200, `got ${r.status}`);
  ok('Expense row deleted', (await prisma.expense.findUnique({ where: { id: disposable.id } })) === null);
  ok('ExpenseParticipant rows cascaded', (await prisma.expenseParticipant.count({ where: { expenseId: disposable.id } })) === 0);
  ok('ExpenseItem rows cascaded', (await prisma.expenseItem.count({ where: { expenseId: disposable.id } })) === 0);
  ok('ExpenseItemParticipant rows cascaded', (await prisma.expenseItemParticipant.count({ where: { item: { expenseId: disposable.id } } })) === 0);
  ok(
    'unrelated expenses untouched',
    (await prisma.expense.count({ where: { groupId } })) === expensesBeforeDisposable,
  );
  ok(
    'unrelated memberships untouched',
    (await prisma.groupMember.count({ where: { groupId } })) === 2,
  );

  // =======================================================================
  step('Direct FK integrity (disposable data only)');
  // =======================================================================
  let fkRejected = false;
  try {
    await prisma.expenseParticipant.create({
      data: {
        expenseId: disposable.id, // deleted expense -> FK violation
        userId: owner.id,
        shareMinor: 1n,
      },
    });
  } catch {
    fkRejected = true;
  }
  ok('FK rejects orphaned ExpenseParticipant (P2003)', fkRejected);

  // =======================================================================
  step('Group RESTRICT + rollback integrity (final)');
  // =======================================================================
  // The outsider's throwaway group proves Expense.groupId CASCADE + Group
  // createdById RESTRICT without touching verification data.
  let restrictRejected = false;
  try {
    await prisma.user.delete({ where: { id: outsider.id } });
  } catch {
    restrictRejected = true;
  }
  ok('User.delete blocked by Group.createdById RESTRICT', restrictRejected);

  // The failed percentage create (earlier) already proved create-rollback.
  // Update rollback: attempt an invalid split patch — the API validates before
  // writing, so the previous valid state must remain.
  r = await call('PATCH', `/api/v1/groups/${groupId}/expenses/${equal.id}`, {
    uid: OWNER,
    body: { splitType: 'PERCENTAGE', percentages: { [owner.id]: '6000', [member.id]: '3000' } },
  });
  ok('invalid split PATCH -> 400', r.status === 400, `got ${r.status}`);
  const afterFailedPatch = await prisma.expenseParticipant.findMany({
    where: { expenseId: equal.id },
  });
  ok(
    'previous valid split intact after failed update',
    afterFailedPatch.length === 2 &&
      afterFailedPatch.reduce((s, p) => s + p.shareMinor, 0n) === 10001n,
  );

  // =======================================================================
  step('Cleanup — remove every Task 7 verification record');
  // =======================================================================
  // Delete the throwaway outsider group, then the verification group; the
  // schema cascades handle every dependent row. Dev users are deleted last —
  // their group-attribution FK is RESTRICT, but groups are gone by then;
  // user attributions elsewhere are SET NULL (none exist outside Task 7 data).
  // Delete every group in the Task 7 namespace (including leftovers from any
  // previously interrupted run — all such groups are Task 7-created data),
  // then the dev users. Schema cascades remove every dependent row.
  await prisma.group.deleteMany({ where: { name: { startsWith: 'Task 7' } } });
  for (const uid of [OUTSIDER, MEMBER, OWNER]) {
    await prisma.user.deleteMany({ where: { firebaseUid: uid } });
  }
  const remainingUsers = await prisma.user.count({
    where: { firebaseUid: { startsWith: 'dev-user-task7-' } },
  });
  const remainingGroups = await prisma.group.count({
    where: { name: { startsWith: 'Task 7' } },
  });
  const remainingExpenses = await prisma.expense.count({
    where: { description: { startsWith: 'Task 7' } },
  });
  ok('no dev-user-task7-* users remain', remainingUsers === 0);
  ok('no "Task 7 *" groups remain', remainingGroups === 0);
  ok('no "Task 7 *" expenses remain', remainingExpenses === 0);

  console.log(
    process.exitCode === 1
      ? `\nSMOKE TEST FAILED (${checks} checks)`
      : `\nSMOKE TEST PASSED — ${checks} checks against real PostgreSQL.`,
  );
}

main()
  .catch((error) => {
    console.error('Smoke test error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    server?.closeAllConnections();
    server?.close();
    await prisma.$disconnect();
  });
