import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@tracker/database';
import { AutomationService } from '../automation/automation.service';
import { PrismaService } from '../database/prisma.service';
import { EmailSyncService } from './email-sync.service';
import { localDate } from './email-sync.policy';

const testUrl = process.env.EMAIL_TEST_DATABASE_URL;

void test(
  'disposable PostgreSQL: explicit selection, duplicate layers, conflict review, tenant isolation and privacy',
  { skip: !testUrl },
  async () => {
    // This opt-in test cannot target tracker or another production database accidentally.
    if (!testUrl || !/^\/tracker_[a-z0-9_]*verify$/u.test(new URL(testUrl).pathname))
      throw new Error('DISPOSABLE_TEST_DATABASE_REQUIRED');
    process.env.DATABASE_URL = testUrl;
    const prisma = new PrismaService();
    await prisma.onModuleInit();
    const service = new EmailSyncService(
      prisma,
      new ConfigService({
        N8N_INTERNAL_URL: 'http://127.0.0.1:1',
        INTERNAL_API_KEY: 'synthetic-test-key-00000000000000000000',
      }),
    );
    const db = prisma.client;
    try {
      const tenantId = randomUUID();
      const otherTenantId = randomUUID();
      for (const id of [tenantId, otherTenantId])
        await db.tenant.create({
          data: {
            id,
            slug: `email-test-${id}`,
            name: 'Synthetic reconciliation test',
            timezone: 'America/Costa_Rica',
            defaultCurrency: 'CRC',
          },
        });
      const integration = await db.integration.create({
        data: { tenantId, provider: 'gmail', type: 'email', status: 'connected' },
      });
      const foreignIntegration = await db.integration.create({
        data: { tenantId: otherTenantId, provider: 'gmail', type: 'email', status: 'connected' },
      });
      const automation = new AutomationService(prisma);
      const action = {
        schemaVersion: 1 as const,
        tenantId,
        actionType: 'n8n.workflow.error',
        idempotencyKey: 'synthetic-same-key',
        status: 'failed' as const,
        input: { body: 'BODY_MUST_NEVER_PERSIST' },
      };
      await automation.recordAction(action);
      await automation.recordAction(action);
      await automation.recordAction({ ...action, tenantId: otherTenantId });
      assert.equal(await db.actionRun.count({ where: { tenantId } }), 1);
      assert.equal(await db.actionRun.count({ where: { tenantId: otherTenantId } }), 1);
      const savedAction = await db.actionRun.findFirstOrThrow({ where: { tenantId } });
      assert.equal(savedAction.tenantId, tenantId);
      assert.deepEqual(savedAction.input, {});
      assert.equal(savedAction.errorCode, 'WORKFLOW_EXECUTION_FAILED');
      const sourceInput = {
        schemaVersion: 1 as const,
        integrationId: integration.id,
        displayName: 'Synthetic bank alerts',
        senderAddress: 'alerts@bank.example',
        institutionName: 'Synthetic Bank',
        adapterKey: 'bank-purchase-html-v1',
        accountId: null,
        defaultCurrency: 'CRC',
        autoIngestionEnabled: true,
        manualSyncEnabled: true,
        status: 'active' as const,
      };
      await assert.rejects(
        service.createSource(tenantId, { ...sourceInput, integrationId: foreignIntegration.id }),
      );
      const source = await service.createSource(tenantId, sourceInput);
      assert.equal((await service.match(tenantId, 'ALERTS@BANK.EXAMPLE')).source?.id, source.id);
      assert.equal((await service.match(otherTenantId, source.senderAddress)).source, null);
      const month = localDate().slice(0, 7);
      const date = `${month}-03`;
      const [year, m] = month.split('-');
      const financialDate = `03/${m}/${year} 11:15`;
      const outside = new Date(`${month}-01T12:00:00-06:00`);
      outside.setUTCDate(0);
      const outsideDate = localDate(outside);
      const message = (
        id: string,
        overrides: {
          amount?: string;
          reference?: string;
          date?: string;
          sender?: string;
          unread?: boolean;
          auth?: boolean;
          invalid?: boolean;
        } = {},
      ) => ({
        id,
        threadId: 'synthetic-thread',
        labelIds: overrides.unread === false ? ['INBOX'] : ['INBOX', 'UNREAD'],
        internalDate: overrides.invalid ? 'invalid' : String(Date.parse(`${date}T11:15:00-06:00`)),
        headers: {
          from: overrides.sender ?? 'alerts@bank.example',
          'authentication-results':
            overrides.auth === false
              ? 'mx.google.com; spf=fail; dkim=fail; dmarc=fail'
              : 'mx.google.com; spf=pass; dkim=pass; dmarc=pass',
        },
        html: `<html><body><table><tr><td>Comercio:</td><td>SYNTHETIC SHOP</td></tr><tr><td>Fecha:</td><td>${overrides.date ?? financialDate}</td></tr><tr><td>Tarjeta:</td><td>XXXXXXXX4242</td></tr><tr><td>Referencia:</td><td>${overrides.reference ?? 'SYNTHREF100001'}</td></tr><tr><td>Tipo de transaccion:</td><td>Compra</td></tr><tr><td>Monto:</td><td>CRC ${overrides.amount ?? '100.25'}</td></tr></table><p>BODY_MUST_NEVER_PERSIST</p><img src="https://do-not-fetch.example/pixel"></body></html>`,
      });
      await assert.rejects(
        service.preview(
          tenantId,
          source.id,
          { schemaVersion: 1, period: 'exact_date', exactDate: outsideDate },
          randomUUID(),
        ),
      );
      const preview = await service.preview(
        tenantId,
        source.id,
        { schemaVersion: 1, period: 'exact_date', exactDate: date },
        randomUUID(),
      );
      await assert.rejects(
        service.preview(
          tenantId,
          source.id,
          { schemaVersion: 1, period: 'current_month' },
          randomUUID(),
        ),
      );
      await assert.rejects(
        service.patchSource(tenantId, source.id, { adapterKey: 'bank-purchase-html-v1' }),
      );
      await service.progress(tenantId, preview.id, 'fetching');
      const first = message('synthetic-first');
      const second = message('synthetic-second', { reference: 'SYNTHREF100002' });
      const outMessage = message('synthetic-outside', {
        date: `${outsideDate.slice(8, 10)}/${outsideDate.slice(5, 7)}/${outsideDate.slice(0, 4)} 11:15`,
      });
      const ready = await service.candidates(tenantId, preview.id, [
        first,
        second,
        outMessage,
        message('synthetic-read', { unread: false }),
        message('synthetic-unconfigured', { sender: 'not-configured@example.test' }),
        message('synthetic-invalid', { invalid: true }),
      ]);
      assert.equal(ready.status, 'awaiting_selection');
      assert.equal(ready.result.found, 4);
      assert.equal(ready.result.eligible, 2);
      assert.equal(await db.sourceEvent.count({ where: { tenantId } }), 0);
      assert.equal(await db.transaction.count({ where: { tenantId } }), 0);
      await assert.rejects(service.select(tenantId, preview.id, [randomUUID()]));
      const chosen = ready.candidates.find((c) => c.messageId === first.id)!;
      await service.select(tenantId, preview.id, [chosen.id]);
      await assert.rejects(service.processMessage(tenantId, preview.id, second));
      await service.patchSource(tenantId, source.id, { status: 'disabled' });
      await assert.rejects(service.processMessage(tenantId, preview.id, first));
      await service.patchSource(tenantId, source.id, { status: 'active' });
      const created = await service.processMessage(tenantId, preview.id, first);
      assert.equal(created.classification, 'new');
      assert.deepEqual(await service.processMessage(tenantId, preview.id, first), created);
      const completed = await service.complete(tenantId, preview.id);
      assert.equal(completed.status, 'completed');
      assert.equal(completed.result.new, 1);
      assert.equal(completed.result.selected, 1);
      assert.equal(completed.result.updated, 0);
      assert.equal(completed.result.ignoredOutsidePeriod, 1);
      assert.equal(completed.result.invalid, 1);
      assert.equal(
        ((await service.automatic(tenantId, first)) as { classification: string }).classification,
        'already_processed',
      );
      assert.equal(
        (
          (await service.automatic(tenantId, message('synthetic-hash-duplicate'))) as {
            classification: string;
          }
        ).classification,
        'exact_duplicate',
      );
      assert.equal(
        (
          (await service.automatic(
            tenantId,
            message('synthetic-reference-conflict', { amount: '100.26' }),
          )) as { classification: string }
        ).classification,
        'conflict',
      );
      // A changed payload for a known Gmail ID points review evidence at the existing observation.
      const changedObservation = (await service.automatic(
        tenantId,
        message(first.id, { amount: '100.27' }),
      )) as { classification: string; sourceEventId: string };
      assert.equal(changedObservation.classification, 'conflict');
      assert.equal(changedObservation.sourceEventId, created.sourceEventId);
      const changedReview = await db.reviewQueue.findUniqueOrThrow({
        where: {
          tenantId_sourceEventId: {
            tenantId,
            sourceEventId: changedObservation.sourceEventId,
          },
        },
      });
      const proposed = changedReview.proposedFinancialCandidate as {
        tenantId: string;
        sourceEventId: string;
        amount: string;
        rawMetadata: object;
      };
      assert.equal(proposed.tenantId, tenantId);
      assert.equal(proposed.sourceEventId, changedObservation.sourceEventId);
      assert.equal(proposed.amount, '100.2700');
      assert.deepEqual(proposed.rawMetadata, {});
      assert.match(changedReview.proposedContentHash ?? '', /^[a-f0-9]{64}$/u);
      await service.automatic(tenantId, message(first.id, { amount: '100.28' }));
      const repeatedReview = await db.reviewQueue.findUniqueOrThrow({
        where: { id: changedReview.id },
      });
      assert.deepEqual(repeatedReview.proposedFinancialCandidate, proposed);
      assert.equal(repeatedReview.proposedContentHash, changedReview.proposedContentHash);
      assert.equal(
        (
          (await service.automatic(
            tenantId,
            message('synthetic-auth-failed', { reference: 'SYNTHREF100003', auth: false }),
          )) as { classification: string }
        ).classification,
        'requires_review',
      );
      const tx = await db.transaction.findFirstOrThrow({ where: { tenantId } });
      await db.transaction.update({
        where: { id: tx.id },
        data: { amount: new Prisma.Decimal('90.00'), manuallyModifiedAt: new Date() },
      });
      assert.equal(
        (
          (await service.automatic(tenantId, message('synthetic-manual-correction'))) as {
            classification: string;
          }
        ).classification,
        'conflict',
      );
      assert.equal(
        (await db.transaction.findUniqueOrThrow({ where: { id: tx.id } })).amount.toFixed(2),
        '90.00',
      );
      assert.equal(
        ((await service.automatic(tenantId, outMessage)) as { classification: string })
          .classification,
        'ignored_outside_period',
      );
      assert.equal(await db.transaction.count({ where: { tenantId } }), 1);
      assert.equal(await db.reviewQueue.count({ where: { tenantId } }), 4);
      const reviewEvidence = await db.reviewQueue.findFirstOrThrow({
        where: { tenantId, proposedFinancialCandidate: { not: Prisma.DbNull } },
      });
      assert.ok(reviewEvidence.proposedContentHash?.match(/^[a-f0-9]{64}$/u));
      assert.deepEqual(
        (reviewEvidence.proposedFinancialCandidate as { rawMetadata: object }).rawMetadata,
        {},
      );
      assert.deepEqual(await service.automatic(otherTenantId, first), {
        accepted: false,
        reasonCode: 'SOURCE_NOT_ENABLED',
      });
      await assert.rejects(service.run(otherTenantId, preview.id));
      await assert.rejects(
        db.emailSyncRun.create({
          data: {
            tenantId: otherTenantId,
            sourceId: source.id,
            idempotencyKey: randomUUID(),
            correlationId: randomUUID(),
            periodMode: 'current_month',
            periodMonth: month,
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      );
      // A late/outside preview exclusion cannot conceal an unprocessed selected message.
      const partial = await service.preview(
        tenantId,
        source.id,
        { schemaVersion: 1, period: 'current_month' },
        randomUUID(),
      );
      const partialReady = await service.candidates(tenantId, partial.id, [second, outMessage]);
      await service.select(tenantId, partial.id, [
        partialReady.candidates.find((c) => c.messageId === second.id)!.id,
      ]);
      const failed = await service.complete(tenantId, partial.id);
      assert.equal(failed.status, 'failed');
      assert.equal(failed.lastErrorCode, 'INCOMPLETE_SELECTION');
      const limited = await service.preview(
        tenantId,
        source.id,
        { schemaVersion: 1, period: 'current_month' },
        randomUUID(),
      );
      const limitedReady = await service.candidates(
        tenantId,
        limited.id,
        Array.from({ length: 12 }, (_, i) =>
          message(`synthetic-limit-${i}`, { reference: `SYNTHLIMIT${String(i).padStart(6, '0')}` }),
        ),
      );
      assert.equal(limitedReady.result.found, 10);
      assert.equal(
        (await service.candidates(tenantId, limited.id, [message('synthetic-extra')])).result.found,
        10,
      );
      await service.cancel(tenantId, limited.id);
      await assert.rejects(service.progress(tenantId, limited.id, 'fetching'));
      await assert.rejects(
        service.candidates(tenantId, limited.id, [message('synthetic-late-callback')]),
      );
      assert.equal((await service.complete(tenantId, limited.id)).status, 'cancelled');
      const concurrent = await Promise.all([
        service.automatic(
          tenantId,
          message('synthetic-concurrent-a', { reference: 'SYNTHCONCURRENT001' }),
        ),
        service.automatic(
          tenantId,
          message('synthetic-concurrent-b', { reference: 'SYNTHCONCURRENT001' }),
        ),
      ]);
      assert.deepEqual(
        concurrent.map((item) => (item as { classification: string }).classification).sort(),
        ['exact_duplicate', 'new'],
      );
      // Simulate an existing ledger row imported before the additive reconciliation-key migration.
      const legacy = await db.transaction.findFirstOrThrow({
        where: { tenantId, externalReference: 'SYNTHCONCURRENT001' },
      });
      const legacyBefore = await db.transaction.update({
        where: { id: legacy.id },
        data: { reconciliationKey: null, financialHash: null },
      });
      assert.equal(
        (
          (await service.automatic(
            tenantId,
            message('synthetic-legacy-duplicate', { reference: 'SYNTHCONCURRENT001' }),
          )) as { classification: string }
        ).classification,
        'exact_duplicate',
      );
      assert.equal(
        (
          await db.transaction.findUniqueOrThrow({ where: { id: legacy.id } })
        ).updatedAt.toISOString(),
        legacyBefore.updatedAt.toISOString(),
      );
      assert.equal(await db.transaction.count({ where: { tenantId } }), 2);
      const privacy = JSON.stringify({
        events: await db.sourceEvent.findMany({ where: { tenantId } }),
        previews: await db.emailSyncCandidate.findMany({ where: { tenantId } }),
        transactions: await db.transaction.findMany({ where: { tenantId } }),
        reviews: await db.reviewQueue.findMany({ where: { tenantId } }),
      });
      for (const forbidden of [
        'BODY_MUST_NEVER_PERSIST',
        '<html>',
        'do-not-fetch.example',
        'authentication-results',
        'htmlBody',
        'textBody',
        'attachments',
        'rawMime',
      ])
        assert.ok(!privacy.includes(forbidden));
    } finally {
      service.onModuleDestroy();
      await prisma.onModuleDestroy();
    }
  },
);
