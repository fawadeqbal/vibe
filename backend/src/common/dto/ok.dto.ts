import { ApiProperty } from '@nestjs/swagger';

export class OkDto {
  @ApiProperty({ example: true })
  ok!: true;
}

export const OK: OkDto = { ok: true };
