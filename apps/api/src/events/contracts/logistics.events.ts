import { LogisticsStatus, LogisticsType } from '@prisma/client';

/** `EVENTS.md` §5.2 — agregat `Logistics`. */

export interface LogisticsStatusChangedPayload {
  logisticsId: string;
  type: LogisticsType;
  previousStatus: LogisticsStatus;
  newStatus: LogisticsStatus;
  trackingNumber: string | null;
}
