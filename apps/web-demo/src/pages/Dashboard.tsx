import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAnalytics, getTimeRanges, type AnalyticsTimeRange } from '@/hooks/useAnalytics';
import { useAuthContext } from '@/hooks/useAuth';

export default function Dashboard() {
  const { user, isAuthenticated } = useAuthContext();
  const { summary, summaryLoading, llmStatus, llmStatusLoading, refresh, isRefreshing } =
    useAnalytics();
  const [selectedRange, setSelectedRange] = useState<AnalyticsTimeRange>(getTimeRanges()[3]); // All Time

  const timeRanges = getTimeRanges();

  if (!isAuthenticated) {
    return (
      <section className="py-16 bg-slate-50 min-h-[80vh]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-md mx-auto text-center">
            <Card>
              <CardHeader>
                <CardTitle>Sign in Required</CardTitle>
                <CardDescription>
                  Please sign in to view your learning analytics dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <a href="/login">Sign In</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-slate-50 min-h-[80vh]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h1>
              <p className="mt-1 text-slate-600">
                Welcome back, <span className="font-medium">{user?.username}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Time Range Selector */}
              <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                {timeRanges.map((range) => (
                  <button
                    key={range.label}
                    onClick={() => setSelectedRange(range)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      selectedRange.label === range.label
                        ? 'bg-primary-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
              <Button onClick={refresh} variant="outline" disabled={isRefreshing} className="gap-2">
                <i className={`fas fa-sync-alt ${isRefreshing ? 'animate-spin' : ''}`}></i>
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Events</CardDescription>
                <CardTitle className="text-3xl">
                  {summaryLoading ? '...' : summary?.totalEvents || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500">All learning events recorded</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Average Attention</CardDescription>
                <CardTitle className="text-3xl">
                  {summaryLoading
                    ? '...'
                    : `${Math.round((summary?.averageAttention || 0) * 100)}%`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={(summary?.averageAttention || 0) * 100} className="h-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Recommendations</CardDescription>
                <CardTitle className="text-3xl">
                  {summaryLoading ? '...' : summary?.eventCounts.recommendations || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500">AI-powered suggestions provided</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Engagements</CardDescription>
                <CardTitle className="text-3xl">
                  {summaryLoading ? '...' : summary?.eventCounts.engagements || 0}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500">Attention recovery interventions</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Activity */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your latest learning events</CardDescription>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <i className="fas fa-spinner animate-spin text-slate-400 text-2xl"></i>
                  </div>
                ) : summary?.recentEvents && summary.recentEvents.length > 0 ? (
                  <div className="space-y-4">
                    {summary.recentEvents.map((event, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0"
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            event.type === 'attention'
                              ? 'bg-blue-100 text-blue-600'
                              : event.type === 'mastery'
                                ? 'bg-green-100 text-green-600'
                                : event.type === 'recommendation'
                                  ? 'bg-purple-100 text-purple-600'
                                  : 'bg-orange-100 text-orange-600'
                          }`}
                        >
                          <i
                            className={`fas ${
                              event.type === 'attention'
                                ? 'fa-eye'
                                : event.type === 'mastery'
                                  ? 'fa-graduation-cap'
                                  : event.type === 'recommendation'
                                    ? 'fa-lightbulb'
                                    : 'fa-bolt'
                            }`}
                          ></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 capitalize">
                            {event.type} Event
                          </p>
                          <p className="text-sm text-slate-500 truncate">
                            {typeof event.data === 'object' && event.data
                              ? JSON.stringify(event.data).slice(0, 100)
                              : 'No details'}
                          </p>
                        </div>
                        <div className="text-xs text-slate-400 flex-shrink-0">
                          {new Date(event.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <i className="fas fa-inbox text-4xl mb-3 text-slate-300"></i>
                    <p>No learning events recorded yet</p>
                    <p className="text-sm mt-1">
                      Start a learning session to see your activity here
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
                <CardDescription>LLM Provider Configuration</CardDescription>
              </CardHeader>
              <CardContent>
                {llmStatusLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <i className="fas fa-spinner animate-spin text-slate-400 text-2xl"></i>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            llmStatus?.hasLLMProvider ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                        ></div>
                        <span className="font-medium text-slate-700">Active Provider</span>
                      </div>
                      <span className="text-sm text-slate-500 capitalize">
                        {llmStatus?.activeProvider || 'fallback'}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2">
                        Configured Providers
                      </p>
                      <div className="space-y-2">
                        {['openai', 'anthropic', 'fallback'].map((provider) => (
                          <div key={provider} className="flex items-center justify-between text-sm">
                            <span className="capitalize text-slate-600">{provider}</span>
                            <span
                              className={
                                llmStatus?.configuredProviders.includes(provider)
                                  ? 'text-green-600'
                                  : 'text-slate-400'
                              }
                            >
                              <i
                                className={`fas ${
                                  llmStatus?.configuredProviders.includes(provider)
                                    ? 'fa-check-circle'
                                    : 'fa-times-circle'
                                }`}
                              ></i>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {!llmStatus?.hasLLMProvider && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                        <i className="fas fa-exclamation-triangle mr-2"></i>
                        Using fallback mode. Configure an API key for enhanced recommendations.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Event Breakdown */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Event Breakdown</CardTitle>
              <CardDescription>Distribution of learning events by type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-100 flex items-center justify-center">
                    <i className="fas fa-eye text-blue-600 text-xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {summary?.eventCounts.attention || 0}
                  </p>
                  <p className="text-sm text-blue-700">Attention</p>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center">
                    <i className="fas fa-graduation-cap text-green-600 text-xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {summary?.eventCounts.mastery || 0}
                  </p>
                  <p className="text-sm text-green-700">Mastery</p>
                </div>

                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-purple-100 flex items-center justify-center">
                    <i className="fas fa-lightbulb text-purple-600 text-xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-purple-600">
                    {summary?.eventCounts.recommendations || 0}
                  </p>
                  <p className="text-sm text-purple-700">Recommendations</p>
                </div>

                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-orange-100 flex items-center justify-center">
                    <i className="fas fa-bolt text-orange-600 text-xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-orange-600">
                    {summary?.eventCounts.engagements || 0}
                  </p>
                  <p className="text-sm text-orange-700">Engagements</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
