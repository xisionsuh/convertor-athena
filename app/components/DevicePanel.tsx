'use client';

import { useState } from 'react';

interface Device {
  id: string;
  name: string;
  platform: 'macos' | 'windows' | 'linux' | string;
  status: 'online' | 'offline';
  lastSeen: Date;
  capabilities: string[];
}

interface DevicePanelProps {
  devices: Device[];
  onPairNew: () => void;
  onDeviceAction: (deviceId: string, action: string) => void;
}

function getPlatformIcon(platform: string): string {
  switch (platform) {
    case 'macos': return '\uD83C\uDF4E';
    case 'windows': return '\uD83E\uDE9F';
    case 'linux': return '\uD83D\uDC27';
    default: return '\uD83D\uDCBB';
  }
}

function formatLastSeen(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function DevicePanel({ devices, onPairNew, onDeviceAction }: DevicePanelProps) {
  const [showPairingDialog, setShowPairingDialog] = useState(false);
  const [pairingCode] = useState(() => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-foreground">Devices</h2>
        <button
          onClick={() => { setShowPairingDialog(true); onPairNew(); }}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Pair New Device
        </button>
      </div>

      {/* Device List */}
      {devices.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">&#x1F4F1;</div>
          <p className="text-sm font-medium text-foreground mb-1">No devices paired</p>
          <p className="text-xs text-muted-foreground mb-4">Pair a device to use remote control features</p>
          <button
            onClick={() => { setShowPairingDialog(true); onPairNew(); }}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Pair Your First Device
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Platform Icon */}
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-xl shrink-0">
                  {getPlatformIcon(device.platform)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{device.name}</p>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      device.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">{device.platform}</span>
                    <span>{device.status === 'online' ? 'Connected' : `Last seen ${formatLastSeen(device.lastSeen)}`}</span>
                  </div>

                  {/* Capabilities */}
                  {device.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {device.capabilities.map((cap) => (
                        <span key={cap} className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded">
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {device.status === 'online' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                  <button
                    onClick={() => onDeviceAction(device.id, 'screenshot')}
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <span>&#x1F4F8;</span> Screenshot
                  </button>
                  <button
                    onClick={() => onDeviceAction(device.id, 'system-info')}
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <span>&#x2139;&#xFE0F;</span> System Info
                  </button>
                  <button
                    onClick={() => onDeviceAction(device.id, 'disconnect')}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pairing Dialog */}
      {showPairingDialog && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPairingDialog(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center animate-fade-in">
            <div className="text-4xl mb-4">&#x1F517;</div>
            <h3 className="text-lg font-bold text-foreground mb-2">Pair New Device</h3>
            <p className="text-sm text-muted-foreground mb-6">Enter this code on your device to connect</p>

            {/* Pairing Code */}
            <div className="flex justify-center gap-2 mb-6">
              {pairingCode.split('').map((digit, i) => (
                <div key={i} className="w-11 h-14 bg-muted border-2 border-primary/30 rounded-lg flex items-center justify-center">
                  <span className="text-2xl font-bold font-mono text-foreground">{digit}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mb-4">Code expires in 5 minutes</p>

            <button
              onClick={() => setShowPairingDialog(false)}
              className="w-full px-4 py-2.5 text-sm font-medium bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
