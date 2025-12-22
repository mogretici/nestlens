import { useState } from 'react';
import { Zap, Users, Clock, Database } from 'lucide-react';
import { EventEntry, JsonValue } from '../types';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface EventDetailViewProps {
  entry: EventEntry;
}

export default function EventDetailView({ entry }: EventDetailViewProps) {
  const { payload } = entry;
  const payloadToolbar = useJsonToolbar();
  const [activeTab, setActiveTab] = useState('listeners');

  const tabs = [
    {
      id: 'listeners',
      label: 'Listeners',
      badge: payload.listeners.length,
      content: (
        <div className="p-4">
          {payload.listeners.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No listeners for this event
            </div>
          ) : (
            <div className="space-y-2">
              {payload.listeners.map((listener, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-sm font-medium">
                      {index + 1}
                    </div>
                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                      {listener}
                    </span>
                  </div>
                  <CopyButton text={listener} />
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'payload',
      label: 'Payload',
      content: payload.payload ? (
        <ControlledInlineJson
          data={payload.payload as JsonValue}
          toolbarState={payloadToolbar.state}
          searchBar={payloadToolbar.SearchBar}
          maxHeight={400}
        />
      ) : (
        <div className="p-4 text-center py-8 text-gray-500 dark:text-gray-400">
          No payload data
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Event Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-mono uppercase">
                  {payload.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Event Details
                </p>
              </div>
            </div>
            <CopyButton text={payload.name} label="Copy event name" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Listeners</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {payload.listeners.length}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {payload.duration}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span>
            </p>
          </div>
          {payload.payload && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                <Database className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Payload Size</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {Object.keys(payload.payload).length}<span className="text-sm font-normal text-gray-500 dark:text-gray-400"> keys</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        defaultTab="listeners"
        hashKey="event"
        headerRight={activeTab === 'payload' && payload.payload ? (
          <payloadToolbar.Toolbar data={payload.payload as JsonValue} />
        ) : undefined}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
