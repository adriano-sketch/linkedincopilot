import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useGmailConnection() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: connection, isLoading: connectionLoading } = useQuery({
    queryKey: ['google_connection', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('google_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isConnected = !!connection?.google_refresh_token;

  const connectGmail = async () => {
    if (!session?.access_token) {
      toast.error('Please sign in first');
      return;
    }

    setIsConnecting(true);
    try {
      const redirectUri = window.location.origin + '/dashboard';

      const { data, error } = await supabase.functions.invoke('gmail-auth-url', {
        body: { redirect_uri: redirectUri, login_hint: user?.email },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No auth URL returned');

      // Redirect to Google OAuth
      window.location.href = data.url;
    } catch (e) {
      console.error('Gmail connect error:', e);
      toast.error('Failed to start Gmail connection');
      setIsConnecting(false);
    }
  };

  const handleOAuthCallback = async (code: string) => {
    if (!session?.access_token) return false;

    setIsConnecting(true);
    try {
      const redirectUri = window.location.origin + '/dashboard';

      const { data, error } = await supabase.functions.invoke('gmail-callback', {
        body: { code, redirect_uri: redirectUri },
      });

      if (error) throw error;
      if (!data?.success) throw new Error('Callback failed');

      queryClient.invalidateQueries({ queryKey: ['google_connection', user?.id] });
      toast.success('Gmail connected successfully!');
      return true;
    } catch (e) {
      console.error('Gmail callback error:', e);
      toast.error('Failed to connect Gmail: ' + (e instanceof Error ? e.message : 'Unknown error'));
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const scanGmail = async (sinceDate: string) => {
    if (!session?.access_token) {
      toast.error('Please sign in first');
      return null;
    }

    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-gmail', {
        body: { since_date: sinceDate },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ['linkedin_events', user?.id] });
      toast.success(`Found ${data.new_connections} new connections!`);
      return data;
    } catch (e) {
      console.error('Scan error:', e);
      toast.error('Scan failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
      return null;
    } finally {
      setIsScanning(false);
    }
  };

  return {
    isConnected,
    connectionLoading,
    isConnecting,
    isScanning,
    connectGmail,
    handleOAuthCallback,
    scanGmail,
  };
}
