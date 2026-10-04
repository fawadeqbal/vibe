import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { CursorQueryDto } from '../../../common/dto/pagination.dto';
import { OK } from '../../../common/dto/ok.dto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { pageArgs, toAdminPage } from '../core/admin-query';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';
import { BanDto, GrantVipDto, NoteDto, ReasonDto, UpdateUserDto, UserListQuery, VerificationDto, WalletAdjustDto } from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';

class ReportsQuery extends CursorQueryDto {
  @IsOptional()
  @IsIn(['received', 'made'])
  direction?: 'received' | 'made';
}

const reasonOf = ({ body }: { body: Record<string, unknown> }) => String(body.reason ?? '');

@StaffApi('users')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions(P.UsersView)
  @ApiOperation({ summary: 'Search by name, e-mail, id or invite code; filter and sort' })
  list(@CurrentStaff() me: StaffPrincipal, @Query() q: UserListQuery) {
    return this.users.list(me, q);
  }

  @Get(':id')
  @RequirePermissions(P.UsersView)
  get(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string) {
    return this.users.get(me, id);
  }

  @Get(':id/ledger')
  @RequirePermissions(P.WalletView)
  ledger(@Param('id') id: string, @Query() q: CursorQueryDto) {
    return this.users.ledgerFor(id, q);
  }

  @Get(':id/matches')
  @RequirePermissions(P.UsersView)
  matches(@Param('id') id: string, @Query() q: CursorQueryDto) {
    return this.users.matchesFor(id, q);
  }

  @Get(':id/reports')
  @RequirePermissions(P.ModerationView)
  reports(@Param('id') id: string, @Query() q: ReportsQuery) {
    return this.users.reportsFor(id, q);
  }

  @Get(':id/purchases')
  @RequirePermissions(P.FinanceView)
  async purchases(@Param('id') id: string, @Query() q: CursorQueryDto) {
    const rows = await this.prisma.purchase.findMany({ where: { userId: id }, ...pageArgs(q) });
    return toAdminPage(rows, q.limit, (p) => p);
  }

  @Get(':id/cashouts')
  @RequirePermissions(P.FinanceView)
  async cashouts(@Param('id') id: string, @Query() q: CursorQueryDto) {
    const rows = await this.prisma.cashout.findMany({ where: { userId: id }, ...pageArgs(q) });
    return toAdminPage(rows, q.limit, (c) => c);
  }

  @Get(':id/notes')
  @RequirePermissions(P.UsersNotes)
  notes(@Param('id') id: string) {
    return this.users.notesFor(id);
  }

  @Get(':id/audit')
  @RequirePermissions(P.AuditView)
  async audit(@Param('id') id: string, @Query() q: CursorQueryDto) {
    const rows = await this.prisma.auditLog.findMany({ where: { targetType: 'user', targetId: id }, ...pageArgs(q) });
    return toAdminPage(rows, q.limit, (r) => r);
  }

  @Patch(':id')
  @RequirePermissions(P.UsersEdit)
  @Audit('user.edited', { target: 'user', summary: reasonOf })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    await this.users.update(id, dto);
    return OK;
  }

  @Post(':id/ban')
  @HttpCode(200)
  @RequirePermissions(P.UsersBan)
  @Audit('user.banned', { target: 'user', summary: ({ body }) => `${String(body.hours)}h: ${String(body.reason)}` })
  ban(@Param('id') id: string, @Body() dto: BanDto) {
    return this.users.ban(id, dto.hours, dto.reason);
  }

  @Post(':id/unban')
  @HttpCode(200)
  @RequirePermissions(P.UsersBan)
  @Audit('user.unbanned', { target: 'user', summary: reasonOf })
  async unban(@Param('id') id: string, @Body() _dto: ReasonDto) {
    await this.users.unban(id);
    return OK;
  }

  @Post(':id/verification')
  @HttpCode(200)
  @RequirePermissions(P.UsersVerify)
  @Audit('user.verification_changed', { target: 'user', summary: ({ body }) => `${body.verified ? 'Verified' : 'Unverified'}: ${String(body.reason)}` })
  async verification(@Param('id') id: string, @Body() dto: VerificationDto) {
    await this.users.setVerified(id, dto.verified);
    return OK;
  }

  @Post(':id/sign-out')
  @HttpCode(200)
  @RequirePermissions(P.UsersSessions)
  @Audit('user.signed_out', { target: 'user' })
  async signOut(@Param('id') id: string) {
    await this.users.signOut(id);
    return OK;
  }

  @Post(':id/wallet')
  @HttpCode(200)
  @RequirePermissions(P.WalletAdjust)
  @Audit('wallet.adjusted', { target: 'user', summary: ({ body }) => `${Number(body.coins ?? 0)} coins, ${Number(body.gems ?? 0)} gems: ${String(body.reason)}` })
  @ApiOperation({ summary: 'Credit (+) or debit (−) coins and gems; idempotent per key' })
  adjust(@Param('id') id: string, @Body() dto: WalletAdjustDto) {
    return this.users.adjustWallet(id, dto);
  }

  @Post(':id/vip')
  @HttpCode(200)
  @RequirePermissions(P.FinanceVip)
  @Audit('vip.granted', { target: 'user', summary: ({ body }) => `${String(body.days)} days: ${String(body.reason)}` })
  grantVip(@Param('id') id: string, @Body() dto: GrantVipDto) {
    return this.users.grantVip(id, dto.days, dto.reason);
  }

  @Delete(':id/vip')
  @RequirePermissions(P.FinanceVip)
  @Audit('vip.revoked', { target: 'user', summary: reasonOf })
  async revokeVip(@Param('id') id: string, @Body() dto: ReasonDto) {
    await this.users.revokeVip(id, dto.reason);
    return OK;
  }

  @Post(':id/notes')
  @RequirePermissions(P.UsersNotes)
  @Audit('user.note_added', { target: 'user', omitBody: true })
  addNote(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.users.addNote(me, id, dto.text);
  }

  @Delete(':id')
  @RequirePermissions(P.UsersDelete)
  @Audit('user.deleted', { target: 'user', summary: reasonOf })
  async remove(@Param('id') id: string, @Body() _dto: ReasonDto) {
    await this.users.delete(id);
    return OK;
  }
}
