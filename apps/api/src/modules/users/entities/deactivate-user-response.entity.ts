import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from './user.entity';

/**
 * USER-003 (ERROR_CODES.md) — kod informacyjny (HTTP 200, nie blokujący),
 * zwracany w `warnings`, dokładnie jak wzorzec opisany dla SLA-001
 * ("zwracane w API wyłącznie jako część odpowiedzi informacyjnej, np.
 * `warnings: ["SLA-001"]"). Dezaktywacja jest DOZWOLONA nawet z
 * niepustym `warnings` — to ostrzeżenie dla UI, nie blokada.
 */
export class DeactivateUserResponseEntity {
  @ApiProperty({ type: UserEntity }) user!: UserEntity;
  @ApiProperty({
    type: [String],
    description: 'Kody ostrzeżeń z ERROR_CODES.md, np. USER-003, gdy użytkownik jest właścicielem otwartych spraw.',
  })
  warnings!: string[];
}
