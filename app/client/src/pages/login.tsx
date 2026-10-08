
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const { signIn, signUp, resetPassword, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Redirect any authenticated user off /login (covers both manual sign-in and auto-login)
  useEffect(() => {
    if (user) {
      const redirectUrl = sessionStorage.getItem('redirectUrl') || '/';
      setLocation(redirectUrl);
      sessionStorage.removeItem('redirectUrl');
    }
  }, [user, setLocation]);

  const handleSubmit = async (type: 'login' | 'signup') => {
    setIsLoading(true);
    try {
      if (type === 'login') {
        await signIn(email, password);
        // useEffect redirects once `user` is populated
      } else {
        const { sessionCreated } = await signUp(email, password);
        if (!sessionCreated) {
          toast({
            title: t("Success"),
            description: t("Please check your email to verify your account."),
          });
        }
        return;
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast({
        title: t("Error"),
        description: t("Please enter your email address"),
        variant: "destructive"
      });
      return;
    }
    try {
      await resetPassword(email);
      toast({
        title: t("Success"),
        description: t("Password reset instructions sent to your email"),
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] p-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-2">PFM</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("Welcome")}</CardTitle>
            <CardDescription>{activeTab === 'login' ? t("Sign in to your account") : t("Create a new account")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" onValueChange={(v) => setActiveTab(v as 'login' | 'signup')}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="login">{t("Login")}</TabsTrigger>
                <TabsTrigger value="signup">{t("Sign Up")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit('login'); }} className="space-y-4">
                  <Input
                    type="email"
                    placeholder={t("Email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t("Password")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('Signing in...') : t('Sign In')}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    className="w-full"
                    onClick={handlePasswordReset}
                  >
                    {t("Forgot password?")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit('signup'); }} className="space-y-4">
                  <Input
                    type="email"
                    placeholder={t("Email")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t("Password")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('Creating account...') : t('Create Account')}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
