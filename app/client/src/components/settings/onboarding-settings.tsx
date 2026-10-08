import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useOnboarding } from '@/components/onboarding/onboarding-context';
import { useFinance } from '@/contexts/finance-context';

const OnboardingSettings: React.FC = () => {
  const { t } = useTranslation();
  const { open } = useOnboarding();
  const { settings } = useFinance();

  if (settings?.onboarded) return null;

  return (
    <>
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t('Initial Setup')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('Re-run the first-time wizard to change your language, currency, and date format.')}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t('Language, currency, and date format.')}
        </span>
        <Button variant="outline" onClick={open}>
          {t('Open setup wizard')}
        </Button>
      </div>
    </div>
    <Separator />
    </>
  );
};

export default OnboardingSettings;