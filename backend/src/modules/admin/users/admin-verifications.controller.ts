import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { Response } from 'express';

import { VerificationService } from '../../users/verification/verification.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';

class QueueQuery {
  @IsOptional()
  @IsIn(Object.values(VerificationStatus))
  status?: VerificationStatus;
}

class RejectDto {
  @IsString()
  @Length(3, 200)
  reason!: string;
}

/** Selfie verifications waiting for a person (manual provider, or close face matches). */
@StaffApi('users')
@Controller('admin/verifications')
export class AdminVerificationsController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @RequirePermissions(P.UsersVerify)
  async queue(@Query() q: QueueQuery) {
    const rows = await this.verification.queue(q.status);
    return rows.map((r) => ({ id: r.id, status: r.status, provider: r.provider, similarity: r.similarity, reason: r.reason, hasSelfie: !!r.selfieKey, createdAt: r.createdAt.toISOString(), reviewedAt: r.reviewedAt?.toISOString() ?? null, reviewedById: r.reviewedById, user: r.user }));
  }

  @Get(':id/selfie')
  @RequirePermissions(P.UsersVerify)
  @Audit('verification.selfie_viewed', { target: 'verification', param: 'id' })
  @ApiOperation({ summary: 'The selfie (only kept while it waits for review)' })
  async selfie(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/jpeg');
    return new StreamableFile(await this.verification.selfie(id));
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(P.UsersVerify)
  @Audit('verification.approved', { target: 'verification', param: 'id' })
  approve(@Param('id') id: string, @CurrentStaff('id') staffId: string) {
    return this.verification.decide(id, staffId, true);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(P.UsersVerify)
  @Audit('verification.rejected', { target: 'verification', param: 'id', summary: ({ body }) => String(body.reason) })
  reject(@Param('id') id: string, @CurrentStaff('id') staffId: string, @Body() dto: RejectDto) {
    return this.verification.decide(id, staffId, false, dto.reason);
  }
}
