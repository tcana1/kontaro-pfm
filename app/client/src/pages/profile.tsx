// Profile has moved into Settings → Profile tab.
import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Profile() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/settings'); }, [setLocation]);
  return null;
}
