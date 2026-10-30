import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAppealDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  message!: string;
}
