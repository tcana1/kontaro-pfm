import React from "react";
import { useTranslation } from 'react-i18next';
import { useDateFnsLocale } from '@/lib/date-fns-locale';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Account } from "@shared/schema";
import { getAccountTypeDisplayName } from '@/utils/account-utils';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabaseService } from "@/services/supabase-service";
import { localDateString } from '@/lib/date-utils';
import { tKey } from '@/lib/i18n-keys';

// Schema for transfer form validation
const transferFormSchema = z.object({
  fromAccountId: z.string().min(1, tKey("Source account is required")),
  toAccountId: z.string().min(1, tKey("Destination account is required")).refine(
    (val) => val !== "",
    tKey("Please select a destination account")
  ),
  amount: z.string().min(1, tKey("Amount is required")).refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    tKey("Amount must be a positive number")
  ),
  date: z.string().min(1, tKey("Please select a date")),
  description: z.string().min(1, tKey("Description is required")),
  notes: z.string().optional(),
});

interface TransferFormProps {
  accounts: Account[];
  userId: string;
  specialCategoryId: number; // Category ID for transfers
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TransferForm({ 
  accounts, 
  userId, 
  specialCategoryId,
  onSuccess,
  onCancel
}: TransferFormProps) {
  const { t } = useTranslation();
  const dateLocale = useDateFnsLocale();
  const { toast } = useToast();

  const filteredAccounts = accounts.filter(a => a.is_active);
  
  const formatDate = (date: Date): string => localDateString(date);
  
  const form = useForm<z.infer<typeof transferFormSchema>>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      fromAccountId: "",
      toAccountId: "",
      amount: "",
      description: "Transfer between accounts",
      date: formatDate(new Date()),
      notes: "",
    },
  });

  // Watch fromAccountId to filter out in toAccount selection
  const fromAccountId = form.watch("fromAccountId");
  
  const onSubmit = async (values: z.infer<typeof transferFormSchema>) => {
    try {
      const fromId = parseInt(values.fromAccountId);
      const toId = parseInt(values.toAccountId);
      const transferAmount = parseFloat(values.amount);

      if (fromId === toId) {
        form.setError("toAccountId", {
          message: tKey("Source and destination accounts must be different")
        });
        return;
      }

      await supabaseService.createLinkedTransactions({
        account_id: fromId,
        to_account_id: toId,
        amount: -transferAmount,
        payment_date: values.date,
        payee: values.description,
        category_id: specialCategoryId,
        user_id: userId,
        notes: values.notes || null,
        type: 'transfer',
      });

      toast({
        title: t('Transfer Complete'),
        description: t('Successfully transferred {{amount}} between accounts.', { amount: transferAmount.toFixed(2) }),
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      toast({
        title: t('Error'),
        description: t('Failed to complete transfer: {{message}}', { message: error instanceof Error ? error.message : t('Unknown error') }),
        variant: "destructive",
      });
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <FormField
            control={form.control}
            name="fromAccountId"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('From Account')}</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (form.getValues("toAccountId") === value) {
                      form.setValue("toAccountId", "");
                    }
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select source account')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {[...filteredAccounts].sort((a, b) => a.name.localeCompare(b.name)).map((account) => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.name} ({getAccountTypeDisplayName(account)})
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
            name="toAccountId"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('To Account')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select destination account')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredAccounts
                      .filter(account => !fromAccountId || account.id.toString() !== fromAccountId)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.name} ({getAccountTypeDisplayName(account)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="flex flex-col gap-4 md:flex-row">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('Amount')}</FormLabel>
                <FormControl>
                  <Input placeholder="0.00" {...field} />
                </FormControl>
                <FormDescription>
                  {t('Enter the amount to transfer')}
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
                <FormLabel>{t('Date')}</FormLabel>
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
          <Button type="submit">{t('Create Transfer')}</Button>
        </div>
      </form>
    </Form>
  );
}