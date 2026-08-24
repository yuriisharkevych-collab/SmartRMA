import { ArrayNotEmpty, IsArray, IsString, IsUUID, MinLength } from 'class-validator';

/** `distributorSlug` — ten sam `Company.slug` co w `/reklamacja/:orgSlug` (Faza 1), rozwiązywany po stronie serwera, nie po `id` (Sklep nie zna UUID cudzej firmy). */
export class InvitePartnershipDto {
  @IsString()
  @MinLength(1)
  distributorSlug!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  brandIds!: string[];
}
