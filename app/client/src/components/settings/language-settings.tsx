import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANG_META } from '@/lib/supported-languages';

const LanguageSettings: React.FC = () => {
  const { t, i18n } = useTranslation();

  const languages = Object.keys(i18n.options.resources ?? {})
    .filter(code => LANG_META[code])
    .map(code => ({ value: code, label: LANG_META[code].uiLabel }));

  const handleChange = (value: string) => {
    i18n.changeLanguage(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t('Language')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Choose the display language for the app.')}
        </p>
      </div>
      <div className="space-y-2">
        <Select value={i18n.resolvedLanguage ?? 'en'} onValueChange={handleChange}>
          <SelectTrigger id="language-select" className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default LanguageSettings;
