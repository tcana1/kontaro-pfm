
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
import { CurrencyCode, getCurrencyOptions, getDefaultLocaleForCurrency } from '@/lib/currency-formatter';

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
  const currentYear = new Date().getFullYear();

  const dateFormatOptions = [
    { value: 'DD/MM/YYYY', label: `DD/MM/YYYY (25/12/${currentYear})` },
    { value: 'MM/DD/YYYY', label: `MM/DD/YYYY (12/25/${currentYear})` },
    { value: 'YYYY/MM/DD', label: `YYYY/MM/DD (${currentYear}/12/25)` },
    { value: 'DD/MMM/YYYY', label: `DD/MMM/YYYY (25/Dec/${currentYear})` },
    { value: 'DD-MM-YYYY', label: `DD-MM-YYYY (25-12-${currentYear})` },
    { value: 'MM-DD-YYYY', label: `MM-DD-YYYY (12-25-${currentYear})` },
    { value: 'YYYY-MM-DD', label: `YYYY-MM-DD (${currentYear}-12-25)` },
    { value: 'DD-MMM-YYYY', label: `DD-MMM-YYYY (25-Dec-${currentYear})` },
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

  // Format preview date according to selected format
  const formatPreviewDate = (date: Date, format: string) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const monthName = date.toLocaleString(form.watch('locale'), { month: 'short' });
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
                {new Intl.NumberFormat(form.watch('locale'), {
                  style: 'currency',
                  currency: form.watch('currency'),
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(1234.56)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('Date Format')}</p>
              <p className="text-base font-medium mt-0.5">
                {formatPreviewDate(new Date('2023-12-24'), form.watch('dateFormat'))}
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
