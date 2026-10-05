import { All, Body, Controller, Get, Headers, HttpCode, HttpStatus, Logger, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createHmac } from 'node:crypto';

import { Public } from '../../common/decorators/public.decorator';
import { AppError } from '../../common/errors/app-error';
import { safeEqual } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { AppleJwsError, AppleJwsVerifier } from '../../integrations/apple/apple-jws';
import { WebhookInbox } from '../../integrations/core/webhook-inbox.service';
import { GoogleAuth } from '../../integrations/google/google-auth';
import { SkipMaintenance } from '../settings/maintenance.guard';
import { withQuery } from './adapters/card/card.adapter';
import { PaymentGateway } from './payment-gateway.service';
import { PaymentsService } from './payments.service';
import { AppleNotification, PlayNotification } from './payment-webhooks.service';

type RawRequest = Request & { rawBody?: Buffer };

/**
 * Every payment provider's callback. Each one is authenticated in its own
 * way (signature, hash, OIDC token, Apple certificate chain), stored in the
 * WebhookInbox (dedupe + retries), then handled by PaymentWebhookHandlers.
 * We answer 200 once stored, so providers don't hammer us with retries
 * while our own retry loop owns failures.
 */
@ApiTags('webhooks')
@Public()
@SkipMaintenance()
@Controller('webhooks')
export class PaymentWebhooksController {
  private readonly logger = new Logger(PaymentWebhooksController.name);

  constructor(
    private readonly inbox: WebhookInbox,
    private readonly payments: PaymentsService,
    private readonly gateway: PaymentGateway,
    private readonly config: AppConfig,
    private readonly google: GoogleAuth,
    private readonly jws: AppleJwsVerifier,
  ) {}

  /** Google Play Real-time developer notifications via a Pub/Sub push subscription. */
  @Post('google-play')
  @HttpCode(200)
  async googlePlay(@Body() body: { message?: { data?: string; messageId?: string; message_id?: string }; subscription?: string }, @Headers('authorization') authorization?: string) {
    const audience = this.config.get('GOOGLE_PLAY_RTDN_AUDIENCE');
    if (audience) {
      try {
        await this.google.verifyOidc((authorization ?? '').replace(/^Bearer\s+/i, ''), audience, this.config.get('GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT') || undefined);
      } catch {
        throw AppError.unauthenticated('Bad Pub/Sub token');
      }
    } else if (this.config.isProduction && this.gateway.playClient) {
      this.logger.warn('Google Play RTDN accepted without OIDC check: set GOOGLE_PLAY_RTDN_AUDIENCE');
    }
    const data = body.message?.data ? (JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8')) as PlayNotification) : null;
    if (!data) return { ok: true };
    const pkg = this.config.get('GOOGLE_PLAY_PACKAGE');
    if (pkg && data.packageName && data.packageName !== pkg) return { ok: true, ignored: 'other package' };
    const type = data.subscriptionNotification ? `subscription.${data.subscriptionNotification.notificationType}` : data.voidedPurchaseNotification ? 'voided' : data.oneTimeProductNotification ? `product.${data.oneTimeProductNotification.notificationType}` : 'test';
    await this.inbox.receive('google-play', { eventId: body.message?.messageId ?? body.message?.message_id, eventType: type, payload: data });
    return { ok: true };
  }

  /** App Store Server Notifications V2: `{ signedPayload }` signed by Apple. */
  @Post('app-store')
  @HttpCode(200)
  async appStore(@Body() body: { signedPayload?: string }) {
    if (!body.signedPayload) throw AppError.unauthenticated('Missing signedPayload');
    let n: AppleNotification;
    try {
      n = await this.jws.verify<AppleNotification>(body.signedPayload);
    } catch (e) {
      if (e instanceof AppleJwsError) throw AppError.unauthenticated(`Bad Apple signature: ${e.message}`);
      throw e;
    }
    const bundle = this.config.get('APPLE_BUNDLE_ID');
    if (bundle && n.data?.bundleId && n.data.bundleId !== bundle) return { ok: true, ignored: 'other app' };
    const appId = this.config.get('APPLE_APP_APPLE_ID');
    if (appId && n.data?.environment === 'Production' && n.data.appAppleId && String(n.data.appAppleId) !== appId) return { ok: true, ignored: 'other app id' };
    await this.inbox.receive('app-store', { eventId: n.notificationUUID, eventType: [n.notificationType, n.subtype].filter(Boolean).join('.'), payload: n });
    return { ok: true };
  }

  /**
   * JazzCash: the hosted page posts the result here (browser, form fields)
   * and the IPN calls it server-to-server (JSON). Both carry pp_SecureHash.
   */
  @Post('jazzcash')
  async jazzcash(@Req() req: Request, @Res() res: Response) {
    const fields = (req.body ?? {}) as Record<string, string>;
    const client = this.gateway.jazzcash;
    const isBrowser = (req.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded');
    if (!client || !client.verify(fields)) {
      this.logger.warn('JazzCash callback with a bad or missing hash');
      return isBrowser ? res.redirect(HttpStatus.SEE_OTHER, withQuery(this.config.get('PAYMENT_RETURN_URL'), { status: 'error' })) : res.status(401).json({ pp_ResponseCode: '401', pp_ResponseMessage: 'Invalid hash' });
    }
    const { event } = await this.inbox.receive('jazzcash', { eventId: `${fields.pp_TxnRefNo}:${fields.pp_ResponseCode}:${fields.pp_RetreivalReferenceNo ?? ''}`, eventType: isBrowser ? 'return' : 'ipn', payload: fields });
    if (isBrowser) {
      const back = event.subjectId ? await this.payments.returnUrlOf(event.subjectId) : undefined;
      return res.redirect(HttpStatus.SEE_OTHER, withQuery(back ?? this.config.get('PAYMENT_RETURN_URL'), { purchase: event.subjectId ?? '', status: fields.pp_ResponseCode === '000' ? 'done' : 'failed' }));
    }
    return res.json(client.sign({ pp_ResponseCode: '000', pp_ResponseMessage: 'IPN received' }));
  }

  /** Easypaisa IPN: `?url=<Easypaisa link with the order>`, or the order fields directly. */
  @All('easypaisa')
  @HttpCode(200)
  async easypaisa(@Query() query: Record<string, string>, @Body() body: Record<string, string> | undefined) {
    const client = this.gateway.easypaisa;
    if (!client) return { ok: true, ignored: 'Easypaisa is not live' };
    let orderId: string | undefined = body?.orderRefNumber ?? body?.orderId ?? query.orderRefNumber ?? query.orderId;
    if (!orderId && query.url) orderId = (await client.readIpn(query.url).catch(() => ({ orderId: undefined }))).orderId;
    if (!orderId) return { ok: true, ignored: 'no order id' };
    // Nothing in an IPN is trusted: the handler asks the inquiry API.
    await this.inbox.receive('easypaisa', { eventId: `${orderId}:${query.url ?? body?.transactionStatus ?? ''}`.slice(0, 200), eventType: 'ipn', payload: { orderId } });
    return { ok: true };
  }

  /** Card gateway webhooks: /v1/webhooks/card/<gateway name>. */
  @Post('card/:gateway')
  @HttpCode(200)
  async card(@Param('gateway') name: string, @Req() req: RawRequest) {
    const gw = this.gateway.cardGateway;
    if (!gw || gw.name !== name) throw AppError.notFound('Card gateway');
    let hook;
    try {
      hook = await gw.parseWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), req.headers);
    } catch {
      throw AppError.unauthenticated('Bad signature');
    }
    if (hook) await this.inbox.receive('card', { eventId: hook.eventId, eventType: hook.type, payload: { sessionRef: hook.sessionRef, purchaseId: hook.purchaseId } });
    return { ok: true };
  }

  /**
   * Generic signed callback for internal tools / simple gateways:
   * `X-Vibe-Signature: hex(hmac-sha256(PAYMENT_WEBHOOK_SECRET, rawBody))`.
   */
  @Post('payments')
  @HttpCode(200)
  async generic(@Req() req: RawRequest, @Headers('x-vibe-signature') signature: string | undefined, @Body() body: { purchaseId: string; providerRef: string; status: 'succeeded' }) {
    const expected = createHmac('sha256', this.config.get('PAYMENT_WEBHOOK_SECRET')).update(req.rawBody ?? Buffer.from(JSON.stringify(body))).digest('hex');
    if (!signature || !safeEqual(signature, expected)) throw AppError.unauthenticated('Bad signature');
    if (body.status === 'succeeded') await this.payments.markPaid(body.purchaseId, body.providerRef);
    return { ok: true };
  }
}

/** The dev card gateway's hosted page (only exists while cards run in dev mode). */
@ApiTags('payments')
@Public()
@SkipMaintenance()
@Controller('payments/dev-checkout')
export class DevCheckoutController {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly inbox: WebhookInbox,
  ) {}

  @Get(':ref')
  @ApiExcludeEndpoint()
  async page(@Param('ref') ref: string, @Res() res: Response) {
    const dev = this.gateway.devCard;
    const s = dev ? await dev.session(ref) : null;
    if (!dev || !s) return res.status(404).send('Checkout not found or expired.');
    const amount = `${s.currency} ${(s.amountMinor / 100).toLocaleString('en-US')}`;
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' vibe: https:");
    return res.send(devCheckoutHtml(ref, esc(s.description), esc(amount), s.status));
  }

  @Post(':ref')
  @ApiExcludeEndpoint()
  async complete(@Param('ref') ref: string, @Body() body: { action?: string }, @Res() res: Response) {
    const dev = this.gateway.devCard;
    const done = dev ? await dev.complete(ref, body.action === 'pay') : null;
    if (!dev || !done) return res.status(404).send('Checkout not found or already finished.');
    // Deliver the webhook the way a real gateway would (signed), then send the browser back to the app.
    const hook = await dev.parseWebhook(Buffer.from(done.body), { 'x-dev-signature': done.signature });
    if (hook) await this.inbox.receive('card', { eventId: hook.eventId, eventType: hook.type, payload: { sessionRef: hook.sessionRef, purchaseId: hook.purchaseId } });
    return res.redirect(HttpStatus.SEE_OTHER, body.action === 'pay' ? done.session.returnUrl : done.session.cancelUrl);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function devCheckoutHtml(ref: string, description: string, amount: string, status: string): string {
  const done = status !== 'pending';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test card checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0a10;color:#f4f2fa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#17141f;border:1px solid #2a2535;border-radius:20px;padding:28px;width:min(360px,90vw)}h1{font-size:18px;margin:0 0 4px}p{color:#a49db5;margin:0 0 20px;font-size:14px}
.amt{font-size:32px;font-weight:700;margin:12px 0 24px}button{width:100%;padding:14px;border-radius:14px;border:0;font-size:16px;font-weight:600;margin-top:10px;cursor:pointer}
.pay{background:#ff4d8d;color:#fff}.no{background:#2a2535;color:#f4f2fa}.tag{display:inline-block;background:#3a2f12;color:#ffcf5a;border-radius:8px;padding:3px 8px;font-size:12px;margin-bottom:14px}</style></head>
<body><div class="card"><span class="tag">TEST MODE · no real money</span><h1>${description}</h1><p>Vibe dev card gateway</p><div class="amt">${amount}</div>
${done ? `<p>This checkout is already ${status}.</p>` : `<form method="post" action="/v1/payments/dev-checkout/${ref}"><button class="pay" name="action" value="pay">Pay</button><button class="no" name="action" value="decline">Decline</button></form>`}
</div></body></html>`;
}
