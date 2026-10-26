
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFinance } from '@/contexts/finance-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CurrencyCode, formatMoney, getCurrencyOptions, getDefaultLocaleForCurrency } from '@/lib/currency-formatter';
import { formatDateForDisplay } from '@/lib/date-utils';

const formSchema = z.object({
  currency: z.string(),
  locale: z.string(),
  dateFormat: z.string(),
});

const CurrencySettings: React.FC = () => {
  const { t } = useTranslation();
  const { currency, setCurrency, locale, setLocale, dateFormat, setDateFormat } = useFinance();
  const { toast } = useToast();
  const currencyOptions = getCurrencyOptions();

  // ISO string, never a Date: `new Date('YYYY-MM-DD')` parses as UTC midnight and
  // reading it back with the local getters lands on the previous day west of UTC.
  const sampleDate = `${new Date().getFullYear()}-12-25`;

  const dateFormatValues = [
    'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY/MM/DD', 'DD/MMM/YYYY',
    'DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY',
  ];

  const localeOptions = [
    { value: 'en-US', label: t('English (US)') },
    { value: 'en-GB', label: t('English (UK)') },
    { value: 'es-ES', label: t('Spanish (Spain)') },
    { value: 'es-MX', label: t('Spanish (Mexico)') },
    { value: 'fr-FR', label: t('French (France)') },
    { value: 'de-DE', label: t('German (Germany)') },
    { value: 'it-IT', label: t('Italian (Italy)') },
    { value: 'pt-BR', label: t('Portuguese (Brazil)') },
    { value: 'ja-JP', label: t('Japanese (Japan)') },
    { value: 'zh-CN', label: t('Chinese (Simplified)') },
    { value: 'en-CA', label: t('English (Canada)') },
    { value: 'en-AU', label: t('English (Australia)') },
    { value: 'en-IN', label: t('English (India)') },
  ];

  // Default form values
  const defaultValues = {
    currency,
    locale,
    dateFormat: dateFormat || 'DD/MM/YYYY',
  };

  // Setup form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // The context holds defaults until settings finish loading, so sync the form once real values arrive.
  useEffect(() => {
    form.reset({ currency, locale, dateFormat: dateFormat || 'DD/MM/YYYY' });
  }, [currency, locale, dateFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Form submit handler
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setCurrency(values.currency as CurrencyCode);
    setLocale(values.locale);
    setDateFormat(values.dateFormat);

    toast({
      title: t('Settings updated'),
      description: t('Your formatting settings have been updated.'),
    });
  };

  // Both the dropdown labels and the preview go through the same formatters the rest
  // of the app uses, so the sample can never drift from what the user will actually see.
  const dateFormatOptions = dateFormatValues.map(value => ({
    value,
    label: `${value} (${formatDateForDisplay(sampleDate, form.watch('locale'), value)})`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('Currency & Date Format Settings')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {t('Customize how numbers, currencies, and dates are displayed throughout the application.')}
        </p>
      </div>

      <div className="md:grid md:grid-cols-[1fr_auto] md:gap-20 space-y-6 md:space-y-0 max-w-2xl">
        {/* Left — inputs */}
        <Form {...form}>
          <form id="currency-settings-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Currency')}</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Suggest the matching locale, but leave it editable —
                      // the user can still pick a different one afterward.
                      form.setValue('locale', getDefaultLocaleForCurrency(value as CurrencyCode));
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select currency')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {currencyOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Number Format Locale')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select locale')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {localeOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Date Format')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select date format')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {dateFormatOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

          </form>
        </Form>

        {/* Right — preview */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md self-start">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{t('Format Preview')}</p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Number Format')}</p>
              <p className="text-base font-medium text-primary mt-0.5">
                {formatMoney(1234.56, { currency: form.watch('currency') as CurrencyCode, locale: form.watch('locale') })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Date Format')}</p>
              <p className="text-base font-medium mt-0.5">
                {formatDateForDisplay(sampleDate, form.watch('locale'), form.watch('dateFormat'))}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button type="submit" form="currency-settings-form">{t('Save Settings')}</Button>
        </div>
      </div>
    </div>
  );
};

export default CurrencySettings;
