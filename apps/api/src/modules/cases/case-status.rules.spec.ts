import { CaseHistoryAction, CaseStatus, Decision } from '@prisma/client';
import { PERMISSIONS } from '../../rbac/constants/permissions.const';
import {
  findTransition,
  historyActionForStatusChange,
  isActiveStatus,
  resolveDecisionPermission,
  resolveTransitionPermission,
} from './case-status.rules';

describe('case-status.rules', () => {
  describe('isActiveStatus', () => {
    it.each([CaseStatus.Zamknieta, CaseStatus.Anulowana, CaseStatus.Zarchiwizowana])('%s NIE jest statusem aktywnym', (status) => {
      expect(isActiveStatus(status)).toBe(false);
    });

    it.each([CaseStatus.Nowa, CaseStatus.Weryfikacja, CaseStatus.RealizacjaDecyzji])('%s JEST statusem aktywnym', (status) => {
      expect(isActiveStatus(status)).toBe(true);
    });
  });

  describe('findTransition', () => {
    it('zwraca przejście dla legalnej zmiany statusu', () => {
      const transition = findTransition(CaseStatus.Nowa, CaseStatus.Przyjeta);
      expect(transition).toEqual({ to: CaseStatus.Przyjeta, permission: PERMISSIONS.CASES_STATUS_CHANGE });
    });

    it('CASE-001 — zwraca undefined dla nieosiągalnego przejścia', () => {
      expect(findTransition(CaseStatus.Nowa, CaseStatus.Zamknieta)).toBeUndefined();
    });

    it('stany końcowe (Anulowana/Zarchiwizowana) nie mają żadnych wyjść', () => {
      expect(findTransition(CaseStatus.Anulowana, CaseStatus.Nowa)).toBeUndefined();
      expect(findTransition(CaseStatus.Zarchiwizowana, CaseStatus.Nowa)).toBeUndefined();
    });

    it('Zamknieta pozwala WYŁĄCZNIE na przejście do Zarchiwizowana', () => {
      expect(findTransition(CaseStatus.Zamknieta, CaseStatus.Zarchiwizowana)).toMatchObject({ permission: PERMISSIONS.CASES_ARCHIVE });
      expect(findTransition(CaseStatus.Zamknieta, CaseStatus.Anulowana)).toBeUndefined();
    });

    it('WORKFLOW.md §4 — z OczekiwanieNaKlienta wraca dokładnie do statusu zapisanego jako `statusBeforeWaiting`', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaKlienta, CaseStatus.WyslanaDoProducenta, {
        statusBeforeWaiting: CaseStatus.WyslanaDoProducenta,
      });
      expect(transition).toMatchObject({ to: CaseStatus.WyslanaDoProducenta, permission: PERMISSIONS.CASES_STATUS_CHANGE });
    });

    it('domyślnie (brak zapisanego statusu) z OczekiwanieNaKlienta wraca do Weryfikacja', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaKlienta, CaseStatus.Weryfikacja, {});
      expect(transition).toMatchObject({ to: CaseStatus.Weryfikacja });
    });

    it('z OczekiwanieNaKlienta odrzuca powrót do INNEGO statusu niż zapisany', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaKlienta, CaseStatus.RealizacjaDecyzji, {
        statusBeforeWaiting: CaseStatus.WyslanaDoProducenta,
      });
      expect(transition).toBeUndefined();
    });

    it('z OczekiwanieNaKlienta zawsze dozwolone Anulowana, niezależnie od zapisanego statusu', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaKlienta, CaseStatus.Anulowana, {
        statusBeforeWaiting: CaseStatus.WyslanaDoProducenta,
      });
      expect(transition).toMatchObject({ to: CaseStatus.Anulowana, permission: PERMISSIONS.CASES_CANCEL });
    });

    it('ścieżka Warranty: Weryfikacja → GotowaDoWysylki niesie CASE-002 jako requiredCheck', () => {
      const transition = findTransition(CaseStatus.Weryfikacja, CaseStatus.GotowaDoWysylki);
      expect(transition?.requiredCheck).toBe('CASE-002');
    });

    it('OczekiwanieNaDecyzjeProducenta → RealizacjaDecyzji wymaga cases.decision.set i CASE-009', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaDecyzjeProducenta, CaseStatus.RealizacjaDecyzji);
      expect(transition).toMatchObject({ permission: PERMISSIONS.CASES_DECISION_SET, requiredCheck: 'CASE-009' });
    });

    it('OczekiwanieNaDecyzjeKierownika → RealizacjaDecyzji wymaga cases.decision.approve (ścieżka rękojmi)', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaDecyzjeKierownika, CaseStatus.RealizacjaDecyzji);
      expect(transition).toMatchObject({ permission: PERMISSIONS.CASES_DECISION_APPROVE, requiredCheck: 'CASE-009' });
    });
  });

  describe('resolveTransitionPermission', () => {
    it('zwraca permission wiersza tabeli w normalnym przypadku', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaDecyzjeProducenta, CaseStatus.RealizacjaDecyzji)!;
      expect(resolveTransitionPermission(transition, Decision.Naprawa)).toBe(PERMISSIONS.CASES_DECISION_SET);
    });

    it('STATE_MACHINE.md reguła dodatkowa — ZwrotSrodkow zawsze wymaga cases.decision.approve, nawet ze ścieżki producenta', () => {
      const transition = findTransition(CaseStatus.OczekiwanieNaDecyzjeProducenta, CaseStatus.RealizacjaDecyzji)!;
      expect(resolveTransitionPermission(transition, Decision.ZwrotSrodkow)).toBe(PERMISSIONS.CASES_DECISION_APPROVE);
    });
  });

  describe('resolveDecisionPermission', () => {
    it('ZwrotSrodkow → zawsze approve, niezależnie od statusu', () => {
      expect(resolveDecisionPermission(CaseStatus.OczekiwanieNaDecyzjeProducenta, Decision.ZwrotSrodkow)).toBe(PERMISSIONS.CASES_DECISION_APPROVE);
    });

    it('OczekiwanieNaDecyzjeKierownika → zawsze approve, niezależnie od decyzji', () => {
      expect(resolveDecisionPermission(CaseStatus.OczekiwanieNaDecyzjeKierownika, Decision.Naprawa)).toBe(PERMISSIONS.CASES_DECISION_APPROVE);
    });

    it('OczekiwanieNaDecyzjeProducenta + decyzja inna niż ZwrotSrodkow → set', () => {
      expect(resolveDecisionPermission(CaseStatus.OczekiwanieNaDecyzjeProducenta, Decision.WymianaCzesci)).toBe(PERMISSIONS.CASES_DECISION_SET);
    });
  });

  describe('historyActionForStatusChange', () => {
    it('mapuje stany końcowe na akcje dedykowane (EVENTS.md §10.2)', () => {
      expect(historyActionForStatusChange(CaseStatus.Zamknieta)).toBe(CaseHistoryAction.CaseClosed);
      expect(historyActionForStatusChange(CaseStatus.Anulowana)).toBe(CaseHistoryAction.CaseCancelled);
      expect(historyActionForStatusChange(CaseStatus.Zarchiwizowana)).toBe(CaseHistoryAction.CaseArchived);
    });

    it('mapuje wszystkie inne przejścia na generyczne StatusChanged', () => {
      expect(historyActionForStatusChange(CaseStatus.Przyjeta)).toBe(CaseHistoryAction.StatusChanged);
      expect(historyActionForStatusChange(CaseStatus.RealizacjaDecyzji)).toBe(CaseHistoryAction.StatusChanged);
    });
  });
});
