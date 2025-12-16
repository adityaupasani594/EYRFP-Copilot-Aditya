'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { calculateMetrics } from '@/lib/rfpParser';

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const response = await fetch('/api/rfps');
      const data = await response.json();
      setMetrics(calculateMetrics(data));
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="ml-48 flex-1">
          <Header />
          <main className="mt-16 p-8 bg-gray-50 min-h-screen flex items-center justify-center">
            <div className="text-gray-600">Loading analytics...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="ml-48 flex-1">
        <Header />
        <main className="mt-16 p-8 bg-gray-50 min-h-screen">
          {/* Win Rate Trends */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Win Rate Trends
            </h2>
            <div className="flex items-end justify-between h-64 gap-4">
              {metrics.winRates.map((data: { month: string; rate: number }, index: number) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-600 rounded-t-lg transition-all hover:bg-blue-700"
                    style={{ height: `${(data.rate / 70) * 100}%` }}
                  ></div>
                  <div className="mt-4 text-center">
                    <div className="text-sm font-semibold text-gray-900">
                      {data.rate}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{data.month}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* RFP Source Effectiveness */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                RFP Source Effectiveness
              </h2>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Website</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metrics.sources.website} RFPs ({Math.round((metrics.sources.website / metrics.rfpsAwaitingReview) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(metrics.sources.website / metrics.rfpsAwaitingReview) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Email</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metrics.sources.email} RFPs ({Math.round((metrics.sources.email / metrics.rfpsAwaitingReview) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(metrics.sources.email / metrics.rfpsAwaitingReview) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Uploaded PDF</span>
                    <span className="text-sm font-medium text-gray-900">
                      {metrics.sources.uploaded} RFPs ({Math.round((metrics.sources.uploaded / metrics.rfpsAwaitingReview) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${(metrics.sources.uploaded / metrics.rfpsAwaitingReview) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent Performance Metrics */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Agent Performance Metrics
              </h2>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Sales Agent
                      </div>
                      <div className="text-xs text-gray-500">
                        Qualification Rate
                      </div>
                    </div>
                    <div className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                      94%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
