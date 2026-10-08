import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AuthCallback() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the URL fragment parameters
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const error = hashParams.get('error');
        const errorDescription = hashParams.get('error_description');

        if (error) {
          setStatus('error');
          setMessage(errorDescription || t('Authentication failed'));
          return;
        }

        // Handle the session from the URL
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setStatus('error');
          setMessage(sessionError.message);
          return;
        }

        if (data.session) {
          setStatus('success');
          setMessage(t('Email verified successfully! Redirecting...'));

          // Redirect to transactions after a short delay
          setTimeout(() => {
            setLocation('/transactions');
          }, 2000);
        } else {
          setStatus('error');
          setMessage(t('No session found. Please try signing in again.'));
        }
      } catch (err) {
        setStatus('error');
        setMessage(t('An unexpected error occurred.'));
        console.error('Auth callback error:', err);
      }
    };

    handleAuthCallback();
  }, [setLocation, t]);

  const handleReturnToLogin = () => {
    setLocation('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {status === 'loading' && <Spinner size="sm" />}
              {status === 'success' && <CheckCircle className="text-green-500" />}
              {status === 'error' && <XCircle className="text-red-500" />}
              {status === 'loading' && t('Verifying...')}
              {status === 'success' && t('Success!')}
              {status === 'error' && t('Verification Failed')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {message}
            </p>

            {status === 'error' && (
              <Button onClick={handleReturnToLogin} className="w-full">
                {t("Return to Login")}
              </Button>
            )}

            {status === 'loading' && (
              <div className="text-center">
                <Spinner size="lg" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
