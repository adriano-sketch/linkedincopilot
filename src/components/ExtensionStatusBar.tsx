import { useExtensionStatus } from '@/hooks/useExtensionStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Wifi, WifiOff, Linkedin, Pause, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export default function ExtensionStatusBar() {
  const { extensionStatus, isLoading } = useExtensionStatus();
  const [toggling, setToggling] = useState(false);

  if (isLoading || !extensionStatus) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border/80 bg-gradient-card shadow-card">
        <WifiOff className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Extension not connected</span>
        <a
          href="https://chrome.google.com/webstore"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline ml-auto"
        >
          Install Extension
        </a>
      </div>
    );
  }

  const isOnline = extensionStatus.is_connected &&
    extensionStatus.last_heartbeat_at &&
    (Date.now() - new Date(extensionStatus.last_heartbeat_at).getTime()) < 120000;

  const connLimit = extensionStatus.daily_limit_connection_requests || 40;
  const connUsed = extensionStatus.connection_requests_today || 0;

  const handleTogglePause = async () => {
    setToggling(true);
    try {
      const { error } = await supabase
        .from('extension_status')
        .update({ is_paused: !extensionStatus.is_paused })
        .eq('id', extensionStatus.id);
      if (error) throw error;
      toast.success(extensionStatus.is_paused ? 'Extension resumed' : 'Extension paused');
    } catch {
      toast.error('Failed to toggle pause');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="relative flex items-center gap-4 px-4 py-3 rounded-xl border border-border/80 bg-gradient-card shadow-card flex-wrap">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-gold opacity-60" />
      {/* Connection status */}
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs">
            <Wifi className="w-3 h-3" /> Online
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-xs">
            <WifiOff className="w-3 h-3" /> Offline
          </Badge>
        )}
        {extensionStatus.linkedin_logged_in && (
          <Badge variant="outline" className="gap-1 text-xs text-blue-600 border-blue-300">
            <Linkedin className="w-3 h-3" /> LinkedIn
          </Badge>
        )}
        {extensionStatus.is_paused && (
          <Badge variant="destructive" className="text-xs">Paused</Badge>
        )}
      </div>

      {/* Daily limits */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-[140px]">
          <span className="text-[10px] text-muted-foreground uppercase font-medium whitespace-nowrap">Connects</span>
          <Progress value={(connUsed / connLimit) * 100} className="h-1.5 flex-1 max-w-[80px]" />
          <span className="text-xs font-medium tabular-nums">{connUsed}/{connLimit}</span>
        </div>
      </div>

      {/* Last heartbeat */}
      {extensionStatus.last_heartbeat_at && (
        <span className="text-[10px] text-muted-foreground hidden lg:inline">
          Last seen {formatDistanceToNow(new Date(extensionStatus.last_heartbeat_at), { addSuffix: true })}
        </span>
      )}

      {/* Pause/Resume */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={handleTogglePause}
        disabled={toggling}
      >
        {toggling ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : extensionStatus.is_paused ? (
          <><Play className="w-3 h-3" /> Resume</>
        ) : (
          <><Pause className="w-3 h-3" /> Pause</>
        )}
      </Button>
    </div>
  );
}
