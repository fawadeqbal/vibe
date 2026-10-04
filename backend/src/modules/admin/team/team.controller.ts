import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { StaffStatus } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { OK } from '../../../common/dto/ok.dto';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';
import { TeamService } from './team.service';

class StaffListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;

  @IsOptional()
  @IsString()
  roleId?: string;
}

class InviteStaffDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(2, 80)
  name!: string;

  @IsString()
  roleId!: string;

  /** Optional; a strong temporary one is generated otherwise. */
  @IsOptional()
  @IsString()
  @Length(10, 200)
  password?: string;
}

class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}

class RoleDto {
  @IsString()
  @Length(2, 40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions!: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions?: string[];
}

@StaffApi('team')
@Controller('admin')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('staff')
  @RequirePermissions(P.StaffView)
  list(@Query() q: StaffListQuery) {
    return this.team.list(q);
  }

  @Get('staff/:id')
  @RequirePermissions(P.StaffView)
  get(@Param('id') id: string) {
    return this.team.get(id);
  }

  @Post('staff')
  @RequirePermissions(P.StaffManage)
  @Audit('staff.invited', { target: 'staff', summary: ({ body }) => `Invited ${String(body.email)}` })
  @ApiOperation({ summary: 'Create a staff account; returns a temporary password once' })
  invite(@CurrentStaff() me: StaffPrincipal, @Body() dto: InviteStaffDto) {
    return this.team.invite(me, dto);
  }

  @Patch('staff/:id')
  @RequirePermissions(P.StaffManage)
  @Audit('staff.updated', { target: 'staff' })
  update(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.team.update(me, id, dto);
  }

  @Post('staff/:id/reset-password')
  @HttpCode(200)
  @RequirePermissions(P.StaffManage)
  @Audit('staff.password_reset', { target: 'staff' })
  resetPassword(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string) {
    return this.team.resetPassword(me, id);
  }

  @Post('staff/:id/reset-2fa')
  @HttpCode(200)
  @RequirePermissions(P.StaffManage)
  @Audit('staff.2fa_reset', { target: 'staff' })
  resetTwoFactor(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string) {
    return this.team.resetTwoFactor(me, id);
  }

  @Post('staff/:id/sign-out')
  @HttpCode(200)
  @RequirePermissions(P.StaffManage)
  @Audit('staff.signed_out', { target: 'staff' })
  async signOut(@CurrentStaff() me: StaffPrincipal, @Param('id') id: string) {
    await this.team.revokeSessions(me, id);
    return OK;
  }

  @Get('roles')
  @RequirePermissions(P.StaffView)
  roles() {
    return this.team.roles();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Permission catalog, grouped, for the role editor' })
  permissions() {
    return this.team.permissionCatalog();
  }

  @Post('roles')
  @RequirePermissions(P.RolesManage)
  @Audit('role.created', { target: 'role', summary: ({ body }) => `Created role ${String(body.name)}` })
  createRole(@Body() dto: RoleDto) {
    return this.team.createRole(dto);
  }

  @Patch('roles/:id')
  @RequirePermissions(P.RolesManage)
  @Audit('role.updated', { target: 'role' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.team.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions(P.RolesManage)
  @Audit('role.deleted', { target: 'role' })
  async deleteRole(@Param('id') id: string) {
    await this.team.deleteRole(id);
    return OK;
  }
}
