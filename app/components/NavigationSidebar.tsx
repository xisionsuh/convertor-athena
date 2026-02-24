'use client';

import { useState } from 'react';

interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  platform: string;
}

export type NavTab = 'chat' | 'tools' | 'devices' | 'recording' | 'settings';

interface NavigationSidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  devices?: Device[];
  onDeviceSelect?: (deviceId: string) => void;
}

const tabs: { id: NavTab; icon: string; label: string }[] = [
  { id: 'chat', icon: '\uD83D\uDCAC', label: 'Chat' },
  { id: 'tools', icon: '\uD83D\uDD27', label: 'Tools' },
  { id: 'devices', icon: '\uD83D\uDCF1', label: 'Devices' },
  { id: 'recording', icon: '\uD83C\uDF99\uFE0F', label: 'Recording' },
  { id: 'settings', icon: '\u2699\uFE0F', label: 'Settings' },
];

export default function NavigationSidebar({
  activeTab,
  onTabChange,
  devices = [],
}: NavigationSidebarProps) {
  const [hoveredTab, setHoveredTab] = useState<NavTab | null>(null);
  const onlineDeviceCount = devices.filter(d => d.status === 'online').length;

  return (
    <nav className="w-14 bg-gray-900 dark:bg-gray-950 flex flex-col items-center py-4 gap-2 shrink-0 border-r border-gray-800">
      {tabs.map((tab) => (
        <div key={tab.id} className="relative">
          <button
            onClick={() => onTabChange(tab.id)}
            onMouseEnter={() => setHoveredTab(tab.id)}
            onMouseLeave={() => setHoveredTab(null)}
            className={`
              w-10 h-10 flex items-center justify-center rounded-lg transition-all text-lg relative
              ${activeTab === tab.id
                ? 'bg-blue-600/20 text-white border-l-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }
            `}
          >
            <span>{tab.icon}</span>
            {tab.id === 'devices' && onlineDeviceCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {onlineDeviceCount}
              </span>
            )}
          </button>
          {hoveredTab === tab.id && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-50 shadow-lg">
              {tab.label}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
