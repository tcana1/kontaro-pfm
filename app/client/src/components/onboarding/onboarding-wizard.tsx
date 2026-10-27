import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinance } from '@/contexts/finance-context';
import { supabaseService } from '@/services/supabase-service';
import { CacheUtils } from '@/lib/cacheUtils';
import { CurrencyCode, getCurrencyOptions } from '@/lib/currency-formatter';
import { useToast } from '@/hooks/use-toast';
import { LANG_META } from '@/lib/supported-languages';

// Fixed date used solely for format previews — do not replace with new Date().
const FORMAT_PREVIEW_DATE = new Date(2025, 11, 25);

const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY' },
  { value: 'YYYY/MM/DD' },
  { value: 'DD/MMM/YYYY' },
  { value: 'DD-MM-YYYY' },
  { value: 'MM-DD-YYYY' },
  { value: 'YYYY-MM-DD' },
  { value: 'DD-MMM-YYYY' },
];

const formatPreviewDate = (date: Date, format: string, lang: string) => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const locale = lang === 'pt-BR' ? 'pt-BR' : 'en-US';
  const monthName = date.toLocaleString(locale, { month: 'short' });
  const year = date.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY/MM/DD': return `${year}/${month}/${day}`;
    case 'DD/MMM/YYYY': return `${day}/${monthName}/${year}`;
    case 'DD-MM-YYYY': return `${day}-${month}-${year}`;
    case 'MM-DD-YYYY': return `${month}-${day}-${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD-MMM-YYYY': return `${day}-${monthName}-${year}`;
    default: return `${day}/${month}/${year}`;
  }
};

interface Props {
  openSignal: number;
}

const OnboardingWizard: React.FC<Props> = ({ openSignal }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings, currency, locale, dateFormat } = useFinance();

  // Derive available languages and locales from whatever is registered in i18n.
  // Adding a new language only requires updating LANG_META + i18n.ts resources.
  const registeredLangs = Object.keys(i18n.options.resources ?? {});
  const availableLanguages = registeredLangs
    .map(code => ({ value: code, label: LANG_META[code]?.uiLabel ?? code }))
    .filter(l => l.label !== l.value || LANG_META[l.value]);
  const availableLocales = registeredLangs
    .flatMap(code => (LANG_META[code] ? [{ value: LANG_META[code].locale, labelEN: LANG_META[code].labelEN, labelPT: LANG_META[code].labelPT }] : []))
    .filter((opt, i, arr) => arr.findIndex(o => o.value === opt.value) === i); // dedupe

  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<string>('en');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  const [selectedLocale, setSelectedLocale] = useState<string>('en-US');
  const [selectedDateFormat, setSelectedDateFormat] = useState<string>('DD/MMM/YYYY');
  const [submitting, setSubmitting] = useState(false);

  const isFirstRun = settings !== null && settings.onboarded === false;

  // Manual reopen (e.g. from Settings)
  useEffect(() => {
    if (openSignal > 0) {
      setDismissed(false);
      setOpen(true);
    }
  }, [openSignal]);

  // Auto-open on first run — disabled for now, wizard needs refinement
  // useEffect(() => {
  //   if (isFirstRun && !dismissed) {
  //     setOpen(true);
  //   }
  // }, [isFirstRun, dismissed]);

  // (Re)initialize selections every time the dialog opens, reflecting the
  // latest stored values. Read at open time only.
  useEffect(() => {
    if (open) {
      setStep(0);
      setLang(i18n.resolvedLanguage ?? 'en');
      setSelectedCurrency(currency);
      setSelectedLocale(locale);
      setSelectedDateFormat(dateFormat || 'DD/MMM/YYYY');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleLanguageChange = (value: string) => {
    setLang(value);
    i18n.changeLanguage(value);
  };

  const persist = async (data: Record<string, unknown>) => {
    // Prevent the dialog from flickering back open while the save is in flight.
    setDismissed(true);
    setSubmitting(true);
    try {
      await supabaseService.updateSettings(data);
      await CacheUtils.invalidateSettings(queryClient);
      setOpen(false);
    } catch (error) {
      console.error('Failed to save onboarding settings:', error);
      setDismissed(false);
      toast({
        title: t('Setup could not be saved'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (isFirstRun) {
      persist({ onboarded: true });
    } else {
      setOpen(false);
    }
  };

  const handleFinish = () => {
    persist({
      onboarded: true,
      currency: selectedCurrency,
      locale: selectedLocale,
      date_format: selectedDateFormat,
    });
  };

  const currencyOptions = getCurrencyOptions(selectedLocale, lang);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // While on the first run the modal is only dismissed via Skip/Finish;
        // X / Escape / outer click behave as "skip for now".
        if (!next) {
          handleSkip();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Initial Setup')}</DialogTitle>
          <DialogDescription>
            {t('Step {{step}} of {{total}}', { step: step + 1, total: 3 })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 0 && (
            <div className="space-y-2">
              <Label htmlFor="wizard-language">{t('Display language')}</Label>
              <Select value={lang} onValueChange={handleLanguageChange}>
                <SelectTrigger id="wizard-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLanguages.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground pt-1">
                {t('Choose the display language for the app.')}
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <Label htmlFor="wizard-currency">{t('Currency')}</Label>
              <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                <SelectTrigger id="wizard-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground pt-1">
                {t('Select the currency used to display amounts.')}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-locale">{t('Number Format Locale')}</Label>
                <Select value={selectedLocale} onValueChange={setSelectedLocale}>
                  <SelectTrigger id="wizard-locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLocales.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {lang === 'pt-BR' ? option.labelPT : option.labelEN}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="wizard-date-format">{t('Date Format')}</Label>
                <Select value={selectedDateFormat} onValueChange={setSelectedDateFormat}>
                  <SelectTrigger id="wizard-date-format">
                    <SelectValue placeholder={t('Select date format')} />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.value} ({formatPreviewDate(FORMAT_PREVIEW_DATE, option.value, lang)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('Format Preview')}
                </p>
                <p className="tabular-nums">
                  {new Intl.NumberFormat(selectedLocale, {
                    style: 'currency',
                    currency: selectedCurrency as CurrencyCode,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(1234.56)}
                </p>
                <p className="tabular-nums">{formatPreviewDate(FORMAT_PREVIEW_DATE, selectedDateFormat, lang)}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
              {isFirstRun ? t('Skip for now') : t('Close')}
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
                  {t('Back')}
                </Button>
              )}
              {step < 2 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={submitting}>
                  {t('Next')}
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={submitting}>
                  {t('Finish')}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizard;