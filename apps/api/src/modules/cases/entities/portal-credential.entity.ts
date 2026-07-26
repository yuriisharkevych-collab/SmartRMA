import { ApiProperty } from '@nestjs/swagger';
import { CaseEntity } from './case.entity';

/**
 * Odpowiedź endpointów generujących dostęp do Portalu Klienta
 * (WORKFLOW.md §6 poz. 13/14) — jedyny moment, w którym wartość jawna
 * (`accessCode`/`token`) opuszcza backend. Nigdy nie jest logowana ani
 * zwracana ponownie (`Case.clientAccessCodeHash`/`clientAccessTokenHash`
 * przechowują wyłącznie bcrypt hash).
 */
export class PortalCredentialEntity {
  @ApiProperty({ type: CaseEntity }) case!: CaseEntity;
  @ApiProperty({ description: 'Kod dostępu lub token linku — pokazany JEDEN raz.' }) value!: string;
}
