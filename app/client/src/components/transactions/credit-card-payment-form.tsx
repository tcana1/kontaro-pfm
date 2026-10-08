import React from "react";
import { useTranslation } from 'react-i18next';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Account } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LocaleAmountInput } from "@/components/ui/locale-amount-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { localDateString } from '@/lib/date-utils';
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { createCreditCardPaymentTransaction, isCreditCard } from "@/utils/transfer-utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { supabaseService } from '@/services/supabase-service';
import { tKey } from '@/lib/i18n-keys';

// Schema for credit card payment form validation
const paymentFormSchema = z.object({
  amount: z.string().min(1, tKey("Amount is required")).refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    tKey("Amount must be a positive number")
  ),
  date: z.string().min(1, tKey("Please select a date")),
  description: z.string().min(1, tKey("Description is required")),
  notes: z.string().optional(),
});

interface CreditCardPaymentFormProps {
  account: Account;
  userId: string;
  specialCategoryId: number; // Category ID for payments
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreditCardPaymentForm({ 
  account, 
  userId, 
  specialCategoryId,
  onSuccess,
  onCancel
}: CreditCardPaymentFormProps) {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const { toast } = useToast();

  // Credit card validation
  if (!isCreditCard(account)) {
    return (
      <div className="text-center p-4">
        <p className="text-red-500">{t('This is not a credit card account.')}</p>
        <Button
          onClick={onCancel}
          className="mt-4"
          variant="outline"
        >
          {t('Close')}
        </Button>
      </div>
    );
  }

  const formatDate = (date: Date): string => localDateString(date);

  const form = useForm<z.infer<typeof paymentFormSchema>>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: "",
      description: `Payment to ${account.name}`,
      date: formatDate(new Date()),
      notes: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof paymentFormSchema>) => {
    try {
      const paymentAmount = parseFloat(values.amount);

      // Create the payment transaction
      // The date is a string in YYYY-MM-DD format
      const paymentTransaction = createCreditCardPaymentTransaction(
        account.id,
        paymentAmount,
        values.date,
        userId,
        values.description,
        values.notes || null,
        specialCategoryId
      );

      // Submit to Supabase using the service's transaction creation method
      const pt = paymentTransaction as any;
      await supabaseService.createUniqueTransaction({
        accountId: pt.accountId,
        paymentDate: pt.date,
        payee: pt.payee || pt.description,
        amount: pt.amount,
        categoryId: pt.categoryId,
        notes: pt.notes,
        type: pt.type,
        userId: pt.userId,
        isRecurring: pt.isRecurring
      });

      toast({
        title: t('Payment Recorded'),
        description: t('Payment of {{amount}} to {{name}} has been recorded.', { amount: paymentAmount.toFixed(2), name: account.name }),
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      toast({
        title: t('Error'),
        description: t('Failed to record payment: {{message}}', { message: error instanceof Error ? error.message : t('Unknown error') }),
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="bg-muted/50 p-3 rounded-md mb-4">
          <h3 className="font-medium">{t('Recording payment to: {{name}}', { name: account.name })}</h3>
          <p className="text-sm text-muted-foreground">
            {t('This will record a payment from an external account (not tracked in this app)')}
          </p>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('Payment Amount')}</FormLabel>
                <FormControl>
                  <LocaleAmountInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    className="!h-10 !px-4 !py-2"
                  />
                </FormControl>
                <FormDescription>
                  {t('Enter the amount paid to this card')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('Payment Date')}</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(parse(field.value, 'yyyy-MM-dd', new Date()), "PPP", { locale: dateLocale })
                        ) : (
                          <span>{t('Pick a date')}</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? parse(field.value, 'yyyy-MM-dd', new Date()) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          field.onChange(formatDate(date));
                        }
                      }}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Description')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Notes (Optional)')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('Add any additional notes here')}
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('Cancel')}
            </Button>
          )}
          <Button type="submit">{t('Payment')}</Button>
        </div>
      </form>
    </Form>
  );
}