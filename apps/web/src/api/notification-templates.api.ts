import { apiClient } from './client';

/** Kształt odzwierciedla `NotificationTemplateEntity` z `apps/api`. */
export interface NotificationTemplate {
  id: string;
  /** `null` = szablon globalny (domyślny, wspólny dla wszystkich firm). Ustawiony = nadpisanie tej firmy. */
  companyId: string | null;
  code: string;
  channel: 'Email' | 'System' | 'SMS';
  subject: string | null;
  bodyTemplate: string;
  variables: string[];
  active: boolean;
}

export interface UpsertTemplateBody {
  code: string;
  channel: NotificationTemplate['channel'];
  subject?: string;
  bodyTemplate: string;
  variables: string[];
}

/**
 * Backend rozróżnia utworzenie nadpisania (`POST`, zawsze per-firma) od
 * edycji istniejącego wiersza (`PATCH`, `code`/`channel` niezmienne) —
 * `upsert` niżej ukrywa tę różnicę: jeśli firma ma już własny wiersz dla
 * `code`/`channel`, edytuje go; jeśli widzi tylko globalny, tworzy
 * nadpisanie z tą samą treścią jako punkt startowy (kopiuj-i-zmień).
 */
export const notificationTemplatesApi = {
  list: () =>
    apiClient.get<NotificationTemplate[]>('/notification-templates').then((res) => res.data),
  create: (body: UpsertTemplateBody) =>
    apiClient.post<NotificationTemplate>('/notification-templates', body).then((res) => res.data),
  update: (
    id: string,
    body: Partial<Omit<UpsertTemplateBody, 'code' | 'channel'>> & { active?: boolean },
  ) =>
    apiClient
      .patch<NotificationTemplate>(`/notification-templates/${id}`, body)
      .then((res) => res.data),
};
