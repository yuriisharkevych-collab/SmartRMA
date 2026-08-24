import { ApiProperty } from '@nestjs/swagger';

/** Odpowiedź `POST /intake/:orgSlug/complaints` — sesja Portalu gotowa od razu (bez osobnego logowania), żeby frontend mógł natychmiast wgrać zdjęcia/wideo/dowód zakupu tym samym tokenem. */
export class PublicComplaintCreatedEntity {
  @ApiProperty() caseNumber!: string;
  @ApiProperty() accessToken!: string;
  @ApiProperty() expiresIn!: number;
}
