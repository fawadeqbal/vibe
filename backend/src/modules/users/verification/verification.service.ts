import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { Injectable, Logger } from '@nestjs/common';
import { VerificationRequest, VerificationStatus } from '@prisma/client';

import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { Clock } from '../../../common/utils/clock';
import { AppConfig } from '../../../config/app-config.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { StorageProvider } from '../../../infra/storage/storage.provider';
import { Integration, IntegrationReporter, IntegrationStatus, missingKeys } from '../../../integrations/core/integration.types';
import { readSecret } from '../../../integrations/core/secrets';
import { RekognitionVerificationProvider } from './rekognition.provider';
import { DevVerificationProvider, ManualVerificationProvider, VerificationProvider } from './verification.provider';

const REKOGNITION_KEYS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];

/**
 * Selfie verification: runs the configured provider, records every attempt
 * (VerificationRequest), keeps the selfie privately only while a person
 * needs to review it, and grants/withdraws the verified badge.
 */
@Integration()
@Injectable()
export class VerificationService implements IntegrationReporter {
  private readonly logger = new Logger(VerificationService.name);
  readonly provider: VerificationProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {
    const kind = config.get('VERIFICATION_PROVIDER');
    if (kind === 'rekognition' && missingKeys(config.env, REKOGNITION_KEYS).length === 0) {
      const client = new RekognitionClient({ region: config.get('AWS_REGION'), credentials: { accessKeyId: config.get('AWS_ACCESS_KEY_ID'), secretAccessKey: readSecret(config.get('AWS_SECRET_ACCESS_KEY'))! } });
      this.provider = new RekognitionVerificationProvider(client, config.get('VERIFICATION_MIN_SIMILARITY'));
    } else if (kind === 'manual' || kind === 'rekognition') {
      // Rekognition without keys falls back to people reviewing, never to auto-approve.
      this.provider = new ManualVerificationProvider();
    } else {
      this.provider = new DevVerificationProvider();
    }
  }

  /** Runs a selfie check. Returns the request (APPROVED / REJECTED / PENDING review). */
  async submit(userId: string, selfie: Buffer | null, avatarUrl: string): Promise<VerificationRequest> {
    if (!selfie && this.provider.name !== 'dev') throw new AppError(ErrorCode.VALIDATION_FAILED, 'Take a selfie to verify');
    const pending = await this.prisma.verificationRequest.findFirst({ where: { userId, status: VerificationStatus.PENDING } });
    if (pending) return pending;
    const recent = await this.prisma.verificationRequest.count({ where: { userId, createdAt: { gt: new Date(this.clock.now().getTime() - 24 * 3600_000) } } });
    if (recent >= 5) throw new AppError(ErrorCode.RATE_LIMITED, 'Too many tries today. Try again tomorrow.', 429);

    const photoKey = avatarUrl ? this.storage.keyFromUrl(avatarUrl) : null;
    const profilePhoto = photoKey ? await this.storage.read(photoKey) : null;
    let d;
    try {
      d = await (this.provider as DevVerificationProvider).verify({ userId, selfie: selfie ?? Buffer.alloc(0), profilePhoto, hasPhoto: !!avatarUrl });
    } catch (e) {
      this.logger.error({ err: e, userId }, 'Verification provider failed; sending to review');
      d = { decision: 'review' as const, reason: 'Automatic check unavailable' };
    }
    const status = d.decision === 'approved' ? VerificationStatus.APPROVED : d.decision === 'rejected' ? VerificationStatus.REJECTED : VerificationStatus.PENDING;
    let selfieKey: string | null = null;
    if (status === VerificationStatus.PENDING && selfie) {
      selfieKey = `selfies/${userId}/${Date.now()}.jpg`;
      await this.storage.put(selfieKey, selfie, 'image/jpeg', { private: true });
    }
    return this.prisma.tx(async (tx) => {
      const req = await tx.verificationRequest.create({ data: { userId, status, provider: this.provider.name, selfieKey, similarity: d.similarity, reason: d.reason } });
      if (status === VerificationStatus.APPROVED) await tx.user.update({ where: { id: userId }, data: { verified: true, verifiedAt: this.clock.now() } });
      return req;
    });
  }

  latest(userId: string) {
    return this.prisma.verificationRequest.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  // ── staff review ──────────────────────────────────────────────────────

  queue(status: VerificationStatus = VerificationStatus.PENDING) {
    return this.prisma.verificationRequest.findMany({ where: { status }, orderBy: { createdAt: 'asc' }, take: 100, include: { user: { select: { id: true, name: true, avatarUrl: true, age: true, countryCode: true } } } });
  }

  async selfie(id: string): Promise<Buffer> {
    const r = await this.prisma.verificationRequest.findUniqueOrThrow({ where: { id } });
    const data = r.selfieKey ? await this.storage.read(r.selfieKey, { private: true }) : null;
    if (!data) throw AppError.notFound('Selfie');
    return data;
  }

  async decide(id: string, staffId: string, approve: boolean, reason?: string) {
    const r = await this.prisma.verificationRequest.findUniqueOrThrow({ where: { id } });
    if (r.status !== VerificationStatus.PENDING) throw AppError.conflict('Already decided');
    const done = await this.prisma.tx(async (tx) => {
      const updated = await tx.verificationRequest.update({ where: { id }, data: { status: approve ? VerificationStatus.APPROVED : VerificationStatus.REJECTED, reviewedById: staffId, reviewedAt: this.clock.now(), reason: reason ?? r.reason, selfieKey: null } });
      if (approve) await tx.user.update({ where: { id: r.userId }, data: { verified: true, verifiedAt: this.clock.now() } });
      return updated;
    });
    // The selfie is only kept while someone needs to look at it.
    if (r.selfieKey) await this.storage.delete(r.selfieKey, { private: true }).catch(() => undefined);
    return done;
  }

  integrationStatus(): IntegrationStatus {
    const kind = this.config.get('VERIFICATION_PROVIDER');
    const missing = kind === 'rekognition' ? missingKeys(this.config.env, REKOGNITION_KEYS) : [];
    return {
      key: 'kyc.selfie',
      kind: 'kyc',
      label: 'Selfie verification',
      mode: this.provider.name === 'dev' ? 'dev' : 'live',
      requiredEnv: kind === 'rekognition' ? REKOGNITION_KEYS : [],
      missingEnv: missing,
      notes: [
        `Provider: ${this.provider.name}${kind === 'rekognition' && missing.length ? ' (Rekognition keys missing → manual review)' : ''}`,
        this.provider.name === 'rekognition' ? `Auto-approve at ≥ ${this.config.get('VERIFICATION_MIN_SIMILARITY')}% similarity; 70–${this.config.get('VERIFICATION_MIN_SIMILARITY')}% goes to review.` : '',
      ].filter(Boolean),
    };
  }
}
