/**
 * Analytics Hook
 * Provides access to learning analytics data from the backend
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnalyticsEvent } from '@/sdk/types';

export interface AnalyticsSummary {
  userId: number;
  totalEvents: number;
  eventCounts: {
    attention: number;
    mastery: number;
    recommendations: number;
    engagements: number;
  };
  averageAttention: number;
  recentEvents: AnalyticsEvent[];
  llmProvider: string;
}

export interface LLMStatus {
  activeProvider: string;
  configuredProviders: string[];
  hasLLMProvider: boolean;
}

async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  const response = await fetch('/api/analytics/summary', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch analytics summary');
  }
  return response.json();
}

async function fetchAttentionEvents(): Promise<AnalyticsEvent[]> {
  const response = await fetch('/api/analytics/attention', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch attention events');
  }
  return response.json();
}

async function fetchMasteryEvents(): Promise<AnalyticsEvent[]> {
  const response = await fetch('/api/analytics/mastery', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch mastery events');
  }
  return response.json();
}

async function fetchLLMStatus(): Promise<LLMStatus> {
  const response = await fetch('/api/llm/status', {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch LLM status');
  }
  return response.json();
}

export function useAnalytics() {
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: fetchAnalyticsSummary,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });

  const attentionQuery = useQuery({
    queryKey: ['analytics', 'attention'],
    queryFn: fetchAttentionEvents,
    staleTime: 30000,
  });

  const masteryQuery = useQuery({
    queryKey: ['analytics', 'mastery'],
    queryFn: fetchMasteryEvents,
    staleTime: 30000,
  });

  const llmStatusQuery = useQuery({
    queryKey: ['llm', 'status'],
    queryFn: fetchLLMStatus,
    staleTime: 60000, // 1 minute
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    queryClient.invalidateQueries({ queryKey: ['llm'] });
  }, [queryClient]);

  return {
    // Summary data
    summary: summaryQuery.data,
    summaryLoading: summaryQuery.isLoading,
    summaryError: summaryQuery.error,

    // Attention data
    attentionEvents: attentionQuery.data || [],
    attentionLoading: attentionQuery.isLoading,

    // Mastery data
    masteryEvents: masteryQuery.data || [],
    masteryLoading: masteryQuery.isLoading,

    // LLM status
    llmStatus: llmStatusQuery.data,
    llmStatusLoading: llmStatusQuery.isLoading,

    // Refresh function
    refresh,
    isRefreshing: summaryQuery.isFetching || attentionQuery.isFetching || masteryQuery.isFetching,
  };
}

export interface AnalyticsTimeRange {
  start: Date;
  end: Date;
  label: string;
}

export function useAnalyticsWithTimeRange(timeRange?: AnalyticsTimeRange) {
  const analytics = useAnalytics();

  // Filter events by time range if provided
  const filteredAttentionEvents = timeRange
    ? analytics.attentionEvents.filter((event) => {
        const eventDate = new Date(event.timestamp);
        return eventDate >= timeRange.start && eventDate <= timeRange.end;
      })
    : analytics.attentionEvents;

  const filteredMasteryEvents = timeRange
    ? analytics.masteryEvents.filter((event) => {
        const eventDate = new Date(event.timestamp);
        return eventDate >= timeRange.start && eventDate <= timeRange.end;
      })
    : analytics.masteryEvents;

  // Calculate time-based metrics
  const calculateAverageAttention = () => {
    if (filteredAttentionEvents.length === 0) return 0;
    const sum = filteredAttentionEvents.reduce((acc, event) => {
      const data = event.data as { attentionScore?: number };
      return acc + (data.attentionScore || 0);
    }, 0);
    return sum / filteredAttentionEvents.length;
  };

  return {
    ...analytics,
    filteredAttentionEvents,
    filteredMasteryEvents,
    timeRangeAverageAttention: calculateAverageAttention(),
  };
}

// Predefined time ranges
export function getTimeRanges(): AnalyticsTimeRange[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return [
    {
      label: 'Today',
      start: today,
      end: now,
    },
    {
      label: 'Last 7 Days',
      start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: now,
    },
    {
      label: 'Last 30 Days',
      start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
      end: now,
    },
    {
      label: 'All Time',
      start: new Date(0),
      end: now,
    },
  ];
}
