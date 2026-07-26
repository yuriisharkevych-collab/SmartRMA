import { RefreshTokenStoreService } from './refresh-token-store.service';

describe('RefreshTokenStoreService', () => {
  let redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let service: RefreshTokenStoreService;

  beforeEach(() => {
    redis = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    service = new RefreshTokenStoreService(redis as never);
  });

  it('store() zapisuje jti pod kluczem per-userId z TTL', async () => {
    await service.store('user-1', 'jti-a', 604800);
    expect(redis.set).toHaveBeenCalledWith('auth-refresh:user-1', 'jti-a', 'EX', 604800);
  });

  it('isValid() zwraca true, gdy przechowany jti zgadza się z podanym', async () => {
    redis.get.mockResolvedValue('jti-a');
    await expect(service.isValid('user-1', 'jti-a')).resolves.toBe(true);
    expect(redis.get).toHaveBeenCalledWith('auth-refresh:user-1');
  });

  it('isValid() zwraca false, gdy jti się nie zgadza (token zrotowany/nieaktualny)', async () => {
    redis.get.mockResolvedValue('jti-nowszy');
    await expect(service.isValid('user-1', 'jti-a')).resolves.toBe(false);
  });

  it('isValid() zwraca false, gdy nic nie jest zapisane (wylogowany/nigdy nie logował)', async () => {
    redis.get.mockResolvedValue(null);
    await expect(service.isValid('user-1', 'jti-a')).resolves.toBe(false);
  });

  it('revoke() usuwa klucz — kolejny isValid() zwróci false', async () => {
    await service.revoke('user-1');
    expect(redis.del).toHaveBeenCalledWith('auth-refresh:user-1');
  });
});
