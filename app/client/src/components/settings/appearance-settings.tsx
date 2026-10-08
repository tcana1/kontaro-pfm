import React from 'react';
import { useFinance } from '@/contexts/finance-context';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Moon, Sun, Monitor } from 'lucide-react';

const formSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
});

const AppearanceSettings: React.FC = () => {
  const { theme, setTheme } = useFinance();
  const { toast } = useToast();
  
  // Default form values
  const defaultValues = {
    theme,
  };
  
  // Setup form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  
  // Form submit handler
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setTheme(values.theme);
    
    toast({
      title: 'Appearance updated',
      description: 'Your theme settings have been updated.',
    });
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Appearance Settings</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Customize the look and feel of the application.
        </p>
      </div>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="theme"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Theme</FormLabel>
                <div className="mt-2">
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="grid grid-cols-3 gap-4"
                  >
                    <FormItem>
                      <FormLabel className="[&:has([data-state=checked])>div]:border-primary">
                        <FormControl>
                          <RadioGroupItem value="light" className="sr-only" />
                        </FormControl>
                        <div className="flex flex-col items-center justify-between rounded-md border-2 border-muted p-4 hover:border-accent cursor-pointer">
                          <Sun className="mb-3 h-6 w-6" />
                          <span className="text-sm font-medium">Light</span>
                        </div>
                      </FormLabel>
                    </FormItem>
                    <FormItem>
                      <FormLabel className="[&:has([data-state=checked])>div]:border-primary">
                        <FormControl>
                          <RadioGroupItem value="dark" className="sr-only" />
                        </FormControl>
                        <div className="flex flex-col items-center justify-between rounded-md border-2 border-muted p-4 hover:border-accent cursor-pointer">
                          <Moon className="mb-3 h-6 w-6" />
                          <span className="text-sm font-medium">Dark</span>
                        </div>
                      </FormLabel>
                    </FormItem>
                    <FormItem>
                      <FormLabel className="[&:has([data-state=checked])>div]:border-primary">
                        <FormControl>
                          <RadioGroupItem value="system" className="sr-only" />
                        </FormControl>
                        <div className="flex flex-col items-center justify-between rounded-md border-2 border-muted p-4 hover:border-accent cursor-pointer">
                          <Monitor className="mb-3 h-6 w-6" />
                          <span className="text-sm font-medium">System</span>
                        </div>
                      </FormLabel>
                    </FormItem>
                  </RadioGroup>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="flex justify-end">
            <Button type="submit">Save Settings</Button>
          </div>
        </form>
      </Form>
      
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h4 className="text-md font-medium mb-2">Theme Preview</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="bg-white text-black p-3 text-sm font-medium border-b border-gray-200">
              Light Theme
            </div>
            <div className="bg-white text-black p-4">
              <div className="bg-gray-100 text-gray-900 p-3 rounded-md mb-2">Background</div>
              <div className="text-primary font-medium">Primary Text</div>
              <div className="text-gray-600">Secondary Text</div>
              <div className="mt-2 flex space-x-2">
                <div className="bg-primary text-white px-3 py-1 rounded-md text-sm">Button</div>
                <div className="border border-gray-200 px-3 py-1 rounded-md text-sm">Button</div>
              </div>
            </div>
          </div>
          
          <div className="rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="bg-gray-800 text-white p-3 text-sm font-medium border-b border-gray-700">
              Dark Theme
            </div>
            <div className="bg-gray-900 text-white p-4">
              <div className="bg-gray-800 text-gray-100 p-3 rounded-md mb-2">Background</div>
              <div className="text-primary font-medium">Primary Text</div>
              <div className="text-gray-400">Secondary Text</div>
              <div className="mt-2 flex space-x-2">
                <div className="bg-primary text-white px-3 py-1 rounded-md text-sm">Button</div>
                <div className="border border-gray-700 px-3 py-1 rounded-md text-sm">Button</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppearanceSettings;
