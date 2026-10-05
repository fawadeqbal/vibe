import { IsOptional, IsString, Length } from 'class-validator';

/** Multipart text fields of POST /me/verification (the images are files). */
export class VerifySelfieDto {
  /** The pose challenge these frames answer (POST /me/verification/challenge). */
  @IsOptional()
  @IsString()
  @Length(10, 64)
  challengeId?: string;
}
