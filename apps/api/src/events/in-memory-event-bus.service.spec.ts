import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from './domain-event.base';
import { InMemoryEventBus } from './in-memory-event-bus.service';

function buildEvent(): DomainEvent<{ x: number }> {
  return new DomainEvent({
    eventName: 'test.event',
    companyId: 'company-1',
    aggregateType: 'Test',
    aggregateId: 'aggregate-1',
    actorUserId: 'user-1',
    correlationId: 'correlation-1',
    payload: { x: 1 },
  });
}

describe('InMemoryEventBus', () => {
  let emitter: jest.Mocked<Pick<EventEmitter2, 'listeners'>>;
  let bus: InMemoryEventBus;

  beforeEach(() => {
    emitter = { listeners: jest.fn() };
    bus = new InMemoryEventBus(emitter as unknown as EventEmitter2);
  });

  it('woła każdego subskrybenta i czeka na wszystkich', async () => {
    const listenerA = jest.fn().mockResolvedValue(undefined);
    const listenerB = jest.fn().mockResolvedValue(undefined);
    emitter.listeners.mockReturnValue([listenerA, listenerB]);

    const event = buildEvent();
    await bus.publish(event);

    expect(listenerA).toHaveBeenCalledWith(event);
    expect(listenerB).toHaveBeenCalledWith(event);
  });

  it('NIE propaguje wyjątku z jednego subskrybenta do wołającego publish() (EVENTS.md §9.1)', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('SMTP down'));
    emitter.listeners.mockReturnValue([failing]);

    await expect(bus.publish(buildEvent())).resolves.toBeUndefined();
  });

  it('błąd JEDNEGO subskrybenta NIE przerywa pozostałych subskrybentów tego samego zdarzenia (EVENTS.md §9.1)', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const succeeding = jest.fn().mockResolvedValue(undefined);
    emitter.listeners.mockReturnValue([failing, succeeding]);

    await bus.publish(buildEvent());

    expect(failing).toHaveBeenCalled();
    expect(succeeding).toHaveBeenCalled();
  });

  it('loguje błąd zamiast cicho go połykać (EVENTS.md §9.3 — zakaz `catch {}` bez logu)', async () => {
    const errorSpy = jest.spyOn((bus as unknown as { logger: { error: (...args: unknown[]) => void } }).logger, 'error').mockImplementation(() => undefined);
    emitter.listeners.mockReturnValue([jest.fn().mockRejectedValue(new Error('boom'))]);

    await bus.publish(buildEvent());

    expect(errorSpy).toHaveBeenCalled();
  });
});
