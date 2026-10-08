import type { Locale } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

const DATE_FNS_LOCALES: Record<string, Locale> = { 'pt-BR': ptBR };

export function getDateFnsLocale(language?: string): Locale {
  return DATE_FNS_LOCALES[language ?? ''] ?? enUS;
}

export function useDateFnsLocale(): Locale {
  const { i18n } = useTranslation();
  return getDateFnsLocale(i18n.resolvedLanguage);
}
