import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { IsDefined, IsOptional } from 'class-validator';

import { EconomyService } from '../../catalog/economy.service';
import { P } from '../core/permissions';
import { Audit, CurrentStaff, RequirePermissions, StaffApi } from '../core/staff-api.decorator';
import type { StaffPrincipal } from '../core/staff.types';

class EconomyUpdateDto {
  /** rules: the changed fields only · packs/plans/gifts: the whole list. */
  @IsDefined()
  value!: unknown;

  /** What the editor started from; a stale base is refused instead of overwriting someone's change. */
  @IsOptional()
  base?: unknown;
}

const changes = ({ result }: { result: unknown }) => {
  const r = result as { section: string; changes: string[] };
  return `${r.section}: ${r.changes.join('; ') || 'no change'}`;
};

/** The Economy page: prices, packs, plans, gifts and rules. Everyone on staff can look; editing needs `ops.economy`. */
@StaffApi('economy')
@Controller('admin/economy')
export class AdminEconomyController {
  constructor(private readonly economy: EconomyService) {}

  @Get()
  @ApiOperation({ summary: 'Live values, defaults, field definitions and who changed each section' })
  get() {
    return this.economy.describe();
  }

  @Put(':section')
  @RequirePermissions(P.OpsEconomy)
  @Audit('economy.changed', { target: 'economy', param: 'section', summary: changes })
  @ApiOperation({ summary: 'Save one section (rules | packs | plans | gifts). Applies at once and tells every app.' })
  async update(@CurrentStaff() me: StaffPrincipal, @Param('section') section: string, @Body() dto: EconomyUpdateDto) {
    const r = await this.economy.update(section, dto.value, dto.base, me.id);
    return { ...r, economy: await this.economy.describe() };
  }

  @Post(':section/reset')
  @HttpCode(200)
  @RequirePermissions(P.OpsEconomy)
  @Audit('economy.reset', { target: 'economy', param: 'section', summary: changes })
  @ApiOperation({ summary: 'Back to the defaults in code for one section' })
  async reset(@Param('section') section: string) {
    const r = await this.economy.reset(section);
    return { ...r, economy: await this.economy.describe() };
  }
}
