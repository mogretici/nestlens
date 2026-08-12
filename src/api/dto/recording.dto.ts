import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of `POST recording/pause`.
 *
 * Every field is optional, which is the point: pausing without saying why is a
 * reasonable thing to ask for, and used to answer
 * `500 Cannot read properties of undefined (reading 'reason')` because the
 * handler read the body without one arriving. The validation pipe substitutes
 * an empty object for a missing body, so a bodyless POST now pauses.
 */
export class PauseRecordingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
