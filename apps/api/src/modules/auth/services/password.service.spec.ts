import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue(4) } as unknown as ConfigService; // niski koszt — testy mają być szybkie
    service = new PasswordService(config);
  });

  it('hash() zwraca wartość różną od hasła jawnego i zaczynającą się od prefiksu bcrypt', async () => {
    const hash = await service.hash('S3cr3t!');
    expect(hash).not.toBe('S3cr3t!');
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('compare() zwraca true dla poprawnego hasła', async () => {
    const hash = await service.hash('S3cr3t!');
    await expect(service.compare('S3cr3t!', hash)).resolves.toBe(true);
  });

  it('compare() zwraca false dla błędnego hasła — nigdy nie rzuca', async () => {
    const hash = await service.hash('S3cr3t!');
    await expect(service.compare('wrong-password', hash)).resolves.toBe(false);
  });

  it('dwa wywołania hash() dla tego samego hasła dają RÓŻNE hashe (losowa sól)', async () => {
    const [a, b] = await Promise.all([service.hash('S3cr3t!'), service.hash('S3cr3t!')]);
    expect(a).not.toBe(b);
  });
});
