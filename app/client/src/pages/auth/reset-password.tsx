import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Check for error parameters in URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = hashParams.get('error');
    const errorDescription = hashParams.get('error_description');

    if (error) {
      toast({
        title: t("Reset Link Error"),
        description: errorDescription || t('The reset link is invalid or has expired.'),
        variant: "destructive"
      });
      // Redirect to login after showing error
      setTimeout(() => {
        setLocation('/login');
      }, 3000);
    }
  }, [toast, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: t("Error"),
        description: t("Passwords do not match"),
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: t("Error"),
        description: t("Password must be at least 6 characters long"),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        toast({
          title: t("Error"),
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: t("Success"),
          description: t("Password updated successfully! Redirecting..."),
        });

        // Redirect to transactions after successful password reset
        setTimeout(() => {
          setLocation('/transactions');
        }, 2000);
      }
    } catch (error) {
      toast({
        title: t("Error"),
        description: t("An unexpected error occurred"),
        variant: "destructive"
      });
      console.error('Password reset error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReturnToLogin = () => {
    setLocation('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] p-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-2">PFM</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("Reset Password")}</CardTitle>
            <CardDescription>{t("Enter your new password below")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("New Password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="relative">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t("Confirm New Password")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('Updating Password...') : t('Update Password')}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleReturnToLogin}
              >
                {t("Return to Login")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
