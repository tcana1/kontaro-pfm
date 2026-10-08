// Single source of truth for supported UI languages.
// To add a language: add an entry here, create the locale JSON, and register
// it in client/src/i18n.ts. Everything else (wizard, settings picker) updates
// automatically.
export const LANG_META: Record<string, { locale: string; labelEN: string; labelPT: string; uiLabel: string }> = {
  'en':    { locale: 'en-US', labelEN: 'English (US)',         labelPT: 'Inglês (EUA)',       uiLabel: 'English' },
  'pt-BR': { locale: 'pt-BR', labelEN: 'Portuguese (Brazil)', labelPT: 'Português (Brasil)', uiLabel: 'Português (Brasil)' },
};
