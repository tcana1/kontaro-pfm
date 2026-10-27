
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';
import { useFinance, type FormatSettings } from '@/contexts/finance-context';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import {
  CurrencyCode,
  CurrencyDisplay,
  formatMoney,
  getCurrencyOptions,
  getCurrencyDisplayOptions,
  getCurrencyPrecision,
  getDefaultLocaleForCurrency,
  getNumberFormatOptions,
} from '@/lib/currency-formatter';
import { formatDateForDisplay } from '@/lib/date-utils';

const SAMPLE_AMOUNT = 1234.56;

const dateFormatValues = [
  'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY/MM/DD', 'DD/MMM/YYYY',
  'DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY',
];

// Marks a field whose value still matches what the chosen currency implies, so
// the user can tell an untouched default from a deliberate override. Rendered in
// normal weight rather than muted: muted text reads as disabled.
const AutoBadge: React.FC<{ label: string }> = ({ label }) => (
  <span className="text-xs text-primary border border-primary/30 rounded px-1.5 py-0.5">{label}</span>
);

const ResetLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" className="text-xs text-primary underline" onClick={onClick}>
    {label}
  </button>
);

const CurrencySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { currency, locale, dateFormat, currencyDisplay, hideCents, setFormatSettings } = useFinance();
  const { toast } = useToast();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  // There is no Save button, so the panel has to say when a change landed — and
  // must not claim it did when the write failed.
  const save = async (patch: FormatSettings) => {
    try {
      await setFormatSettings(patch);
      setJustSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save formatting settings:', error);
      toast({
        variant: 'destructive',
        title: t('Settings not saved'),
        description: t('Your formatting change could not be saved. Please try again.'),
      });
    }
  };

  // ISO string, never a Date: `new Date('YYYY-MM-DD')` parses as UTC midnight and
  // reading it back with the local getters lands on the previous day west of UTC.
  const sampleDate = `${new Date().getFullYear()}-12-25`;
  const effectiveDateFormat = dateFormat || 'DD/MM/YYYY';

  // Every option label is produced by the same formatter the rest of the app
  // uses, so no option can advertise a format the app will not render.
  const currencyOptions = getCurrencyOptions(locale, i18n.resolvedLanguage || undefined);
  const numberFormatOptions = getNumberFormatOptions(locale);
  const displayOptions = getCurrencyDisplayOptions(currency, locale);
  const dateFormatOptions = dateFormatValues.map(value => ({
    value,
    label: `${value} (${formatDateForDisplay(sampleDate, locale, value)})`,
  }));

  const derivedLocale = getDefaultLocaleForCurrency(currency);
  const localeIsAuto = locale === derivedLocale;
  const displayIsAuto = currencyDisplay === 'symbol';

  // Picking a currency re-seeds the number format, but only while it is still
  // the suggested one — a deliberate override survives a currency change.
  const handleCurrencyChange = (value: string) => {
    const next = value as CurrencyCode;
    const nextLocale = localeIsAuto ? getDefaultLocaleForCurrency(next) : locale;
    // A currency may not offer the chosen display at all: BRL renders the same
    // symbol narrow or wide, so narrowSymbol is deduped out of its options.
    const stillOffered = getCurrencyDisplayOptions(next, nextLocale).some(o => o.value === currencyDisplay);
    save({
      currency: next,
      ...(localeIsAuto && { locale: nextLocale }),
      ...(!stillOffered && { currencyDisplay: 'symbol' as CurrencyDisplay }),
    });
  };

  const preview = (amount: number) =>
    formatMoney(amount, { currency, locale, currencyDisplay, hideCents });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">{t('Currency & Date Format Settings')}</h3>
          {justSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
              <Check className="h-3 w-3" />
              {t('Saved')}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {t('Every option below is shown in the format it produces, and changes are saved as you make them. Picking a currency suggests a number format and symbol; change either one to override it.')}
        </p>
      </div>

      <div className="md:grid md:grid-cols-[1fr_auto] md:gap-20 space-y-6 md:space-y-0 max-w-2xl">
        {/* Left — inputs */}
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="format-currency">{t('Currency')}</Label>
            <Select value={currency} onValueChange={handleCurrencyChange}>
              {/* The trigger deliberately omits the spelled-out currency name that
                  the open list shows: it belongs in the picker, not in the
                  collapsed state. */}
              <SelectTrigger id="format-currency">
                <span className="tabular-nums">
                  {currency} — {formatMoney(SAMPLE_AMOUNT, { currency, locale })}
                </span>
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="format-number">{t('Number Format')}</Label>
              {localeIsAuto
                ? <AutoBadge label={t('Auto')} />
                : <ResetLink label={t('Reset')} onClick={() => save({ locale: derivedLocale })} />}
            </div>
            <Select value={locale} onValueChange={(value) => save({ locale: value })}>
              <SelectTrigger id="format-number">
                <span className="tabular-nums">
                  {numberFormatOptions.find(o => o.value === locale)?.label ?? locale}
                </span>
              </SelectTrigger>
              <SelectContent>
                {numberFormatOptions.map(option => (
                  <SelectItem key={option.value} value={option.value} className="tabular-nums">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="format-date">{t('Date Format')}</Label>
            <Select value={effectiveDateFormat} onValueChange={(value) => save({ dateFormat: value })}>
              <SelectTrigger id="format-date">
                <span className="tabular-nums">
                  {dateFormatOptions.find(o => o.value === effectiveDateFormat)?.label ?? effectiveDateFormat}
                </span>
              </SelectTrigger>
              <SelectContent>
                {dateFormatOptions.map(option => (
                  <SelectItem key={option.value} value={option.value} className="tabular-nums">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={customizeOpen} onOpenChange={setCustomizeOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-primary">
              <ChevronRight className={`h-4 w-4 transition-transform ${customizeOpen ? 'rotate-90' : ''}`} />
              {t('Customize')}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-6 pt-4 pl-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="format-symbol">{t('Currency symbol')}</Label>
                  {displayIsAuto
                    ? <AutoBadge label={t('Auto')} />
                    : <ResetLink label={t('Reset')} onClick={() => save({ currencyDisplay: 'symbol' })} />}
                </div>
                <Select
                  value={currencyDisplay}
                  onValueChange={(value) => save({ currencyDisplay: value as CurrencyDisplay })}
                >
                  <SelectTrigger id="format-symbol">
                    <span className="tabular-nums">
                      {displayOptions.find(o => o.value === currencyDisplay)?.label ?? currencyDisplay}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {displayOptions.map(option => (
                      <SelectItem key={option.value} value={option.value} className="tabular-nums">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* A zero-decimal currency like JPY has no cents to hide. */}
              {getCurrencyPrecision(currency) > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="format-hide-cents">{t('Hide cents')}</Label>
                  <Switch
                    id="format-hide-cents"
                    checked={hideCents}
                    onCheckedChange={(checked) => save({ hideCents: checked })}
                    aria-label={t('Hide cents')}
                  />
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Right — preview. The rows on the left each demo one knob in isolation
            and keep cents visible so the decimal separator stays readable; this
            is the only place the symbol, the punctuation and the hide-cents
            choice appear combined, exactly as the rest of the app renders them. */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md self-start">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-6">
            {t('Format Preview')}
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Income')}</p>
              <p className="text-base font-medium text-primary mt-0.5 tabular-nums">
                {preview(SAMPLE_AMOUNT)}
              </p>
            </div>
            {/* Locales disagree on where the minus sign sits relative to the
                symbol, so a negative amount gets its own line. */}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Expense')}</p>
              <p className="text-base font-medium mt-0.5 tabular-nums">
                {preview(-SAMPLE_AMOUNT)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Date')}</p>
              <p className="text-base font-medium mt-0.5 tabular-nums">
                {formatDateForDisplay(sampleDate, locale, effectiveDateFormat)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurrencySettings;
