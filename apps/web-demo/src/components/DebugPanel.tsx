/**
 * Debug Panel Component
 * Provides real-time debugging information for developers
 */

import React, { useState, useEffect } from 'react';
import { useWebSocket, type ConnectionStatus } from '@/hooks/useWebSocket';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useNoesisSDK } from '@/hooks/useNoesisSDK';

interface DebugPanelProps {
  enabled?: boolean;
}

export function DebugPanel({ enabled = true }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'state' | 'network' | 'sdk' | 'metrics'>('state');

  // Only show in development or when explicitly enabled
  const showPanel =
    enabled &&
    (process.env.NODE_ENV === 'development' ||
      window.localStorage.getItem('debugPanel') === 'true');

  if (!showPanel) {
    return null;
  }

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 z-50 w-10 h-10 bg-slate-800 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-700 transition-colors"
        title="Toggle Debug Panel"
      >
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-bug'}`}></i>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-16 left-4 z-50 w-96 max-h-[600px] bg-slate-900 text-slate-100 rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
            <span className="font-medium text-sm">Debug Panel</span>
            <div className="flex gap-1">
              {(['state', 'network', 'sdk', 'metrics'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-2 py-1 text-xs rounded ${
                    activeTab === tab ? 'bg-slate-700' : 'hover:bg-slate-700/50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-4 overflow-auto max-h-[500px]">
            {activeTab === 'state' && <StatePanel />}
            {activeTab === 'network' && <NetworkPanel />}
            {activeTab === 'sdk' && <SDKPanel />}
            {activeTab === 'metrics' && <MetricsPanel />}
          </div>
        </div>
      )}
    </>
  );
}

function StatePanel() {
  const { summary, llmStatus } = useAnalytics();

  return (
    <div className="space-y-4">
      <Section title="Analytics Summary">
        {summary ? (
          <pre className="text-xs overflow-auto">{JSON.stringify(summary, null, 2)}</pre>
        ) : (
          <span className="text-slate-400">Loading...</span>
        )}
      </Section>

      <Section title="LLM Status">
        {llmStatus ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Provider:</span>
              <span className="text-green-400">{llmStatus.activeProvider}</span>
            </div>
            <div className="flex justify-between">
              <span>Has Provider:</span>
              <span className={llmStatus.hasLLMProvider ? 'text-green-400' : 'text-yellow-400'}>
                {llmStatus.hasLLMProvider ? 'Yes' : 'No (Fallback)'}
              </span>
            </div>
            <div>
              <span>Configured:</span>
              <span className="ml-2 text-slate-400">
                {llmStatus.configuredProviders.join(', ')}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-slate-400">Loading...</span>
        )}
      </Section>
    </div>
  );
}

function NetworkPanel() {
  const { status: wsStatus } = useWebSocket({ autoConnect: false });
  const [requests, setRequests] = useState<{ url: string; status: number; time: number }[]>([]);

  // Track network requests (simplified)
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const start = Date.now();
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

      try {
        const response = await originalFetch.apply(this, args);
        setRequests((prev) => [
          { url, status: response.status, time: Date.now() - start },
          ...prev.slice(0, 19),
        ]);
        return response;
      } catch (error) {
        setRequests((prev) => [{ url, status: 0, time: Date.now() - start }, ...prev.slice(0, 19)]);
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const getStatusColor = (status: number) => {
    if (status === 0) return 'text-red-400';
    if (status >= 500) return 'text-red-400';
    if (status >= 400) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getWsStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'text-green-400';
      case 'connecting':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-4">
      <Section title="WebSocket">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected'
                ? 'bg-green-400'
                : wsStatus === 'connecting'
                  ? 'bg-yellow-400'
                  : wsStatus === 'error'
                    ? 'bg-red-400'
                    : 'bg-slate-400'
            }`}
          ></span>
          <span className={getWsStatusColor(wsStatus)}>{wsStatus}</span>
        </div>
      </Section>

      <Section title="Recent Requests">
        {requests.length > 0 ? (
          <div className="space-y-1 text-xs">
            {requests.map((req, i) => (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-800">
                <span className={`font-mono ${getStatusColor(req.status)}`}>
                  {req.status || 'ERR'}
                </span>
                <span className="flex-1 truncate text-slate-400">{req.url}</span>
                <span className="text-slate-500">{req.time}ms</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">No requests yet</span>
        )}
      </Section>
    </div>
  );
}

function SDKPanel() {
  const sdk = useNoesisSDK();
  const [sdkState, setSDKState] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const updateState = () => {
      setSDKState({
        initialized: sdk.isInitialized(),
        activeModules: sdk.getActiveModules(),
        learnerState: sdk.getLearnerState(),
      });
    };

    updateState();
    const interval = setInterval(updateState, 1000);
    return () => clearInterval(interval);
  }, [sdk]);

  return (
    <div className="space-y-4">
      <Section title="SDK State">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Initialized:</span>
            <span className={sdkState.initialized ? 'text-green-400' : 'text-red-400'}>
              {sdkState.initialized ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span>Active Modules:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {((sdkState.activeModules as string[]) || []).map((mod) => (
                <span key={mod} className="px-2 py-0.5 bg-slate-800 rounded text-xs">
                  {mod}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Learner State">
        <pre className="text-xs overflow-auto max-h-40">
          {JSON.stringify(sdkState.learnerState, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function MetricsPanel() {
  const [metrics, setMetrics] = useState<{
    memory: { usedJSHeapSize: number; totalJSHeapSize: number };
    timing: { domContentLoadedEventEnd: number; loadEventEnd: number };
  } | null>(null);

  useEffect(() => {
    const updateMetrics = () => {
      const memory = (
        performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
      ).memory;
      const timing = performance.timing;

      setMetrics({
        memory: memory || { usedJSHeapSize: 0, totalJSHeapSize: 0 },
        timing: {
          domContentLoadedEventEnd: timing?.domContentLoadedEventEnd || 0,
          loadEventEnd: timing?.loadEventEnd || 0,
        },
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return 'N/A';
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <Section title="Memory">
        {metrics?.memory ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Used Heap:</span>
              <span>{formatBytes(metrics.memory.usedJSHeapSize)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Heap:</span>
              <span>{formatBytes(metrics.memory.totalJSHeapSize)}</span>
            </div>
            {metrics.memory.totalJSHeapSize > 0 && (
              <div className="mt-2">
                <div className="w-full h-2 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${(metrics.memory.usedJSHeapSize / metrics.memory.totalJSHeapSize) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <span className="text-slate-400">Not available</span>
        )}
      </Section>

      <Section title="Environment">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Mode:</span>
            <span className="text-yellow-400">{process.env.NODE_ENV || 'development'}</span>
          </div>
          <div className="flex justify-between">
            <span>User Agent:</span>
            <span className="text-slate-400 text-xs truncate max-w-[200px]">
              {navigator.userAgent.split(' ').slice(-1)[0]}
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-slate-400 uppercase mb-2">{title}</h3>
      {children}
    </div>
  );
}

export default DebugPanel;
