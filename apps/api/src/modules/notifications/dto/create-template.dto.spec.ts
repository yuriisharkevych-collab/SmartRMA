import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

/**
 * Regresja: `variables` był oznaczony `@IsObject()`, który class-validator
 * jawnie odrzuca dla tablic (`Array.isArray` jest wykluczone z `isObject`),
 * więc `POST /notification-templates` nigdy nie przechodził z poprawną
 * tablicą stringów — wykryte dopiero przy pierwszym realnym wywołaniu z UI
 * (Ustawienia › Szablony wiadomości).
 */
describe('CreateTemplateDto', () => {
  it('accepts a valid string array for `variables`', async () => {
    const instance = plainToInstance(CreateTemplateDto, {
      code: 'case.created.customer',
      channel: 'Email',
      subject: 'Temat',
      bodyTemplate: 'Treść {{caseNumber}}',
      variables: ['caseNumber', 'customerName'],
    });
    const errors = await validate(instance);
    expect(errors).toEqual([]);
  });

  it('rejects a non-array value for `variables`', async () => {
    const instance = plainToInstance(CreateTemplateDto, {
      code: 'case.created.customer',
      channel: 'Email',
      bodyTemplate: 'Treść',
      variables: 'not-an-array',
    });
    const errors = await validate(instance);
    expect(errors.some((e) => e.property === 'variables')).toBe(true);
  });

  it('rejects an array containing non-string elements', async () => {
    const instance = plainToInstance(CreateTemplateDto, {
      code: 'case.created.customer',
      channel: 'Email',
      bodyTemplate: 'Treść',
      variables: ['caseNumber', 42],
    });
    const errors = await validate(instance);
    expect(errors.some((e) => e.property === 'variables')).toBe(true);
  });
});
