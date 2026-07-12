import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getStats, triggerSync } from "../../services/staging";
import { useState } from "react";

export const Route = createFileRoute("/staging/")({
  loader: () => getStats(),
  component: StagingDashboard,
});

function StagingDashboard() {
  const stats = Route.useLoaderData();
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await triggerSync();
      await router.invalidate();
    } catch (err) {
      console.error("Sync failed:", err);
      alert("Sync failed. Check server logs.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Staging Dashboard</h2>
        <p className="text-gray-600 dark:text-gray-400">Overview of inbound data streams and system health.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 uppercase">Total Buyer Leads</p>
          <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">{stats.totalLeads}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 uppercase">Locked Leads</p>
          <p className="text-3xl font-bold mt-2 text-indigo-600 dark:text-indigo-400">{stats.lockedLeads}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 uppercase">Distressed Properties</p>
          <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">{stats.totalProperties}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 uppercase">Global Last Fetch</p>
          <p className="text-xl font-bold mt-2 text-gray-900 dark:text-white">
            {stats.lastFetch === "Never" ? "Never" : new Date(stats.lastFetch).toLocaleTimeString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-4 dark:text-white">Feed Status</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">The Gazette (Insolvency)</span>
              <div className="text-right">
                <span className="text-sm font-medium text-green-600 dark:text-green-400 block">Connected</span>
                <span className="text-xs text-gray-400">Last: {stats.gazetteLastFetch === "Never" ? "Never" : new Date(stats.gazetteLastFetch).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-between items-center border-t pt-4 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400">data.gov.uk (Planning)</span>
              <div className="text-right">
                <span className="text-sm font-medium text-green-600 dark:text-green-400 block">Connected</span>
                <span className="text-xs text-gray-400">Last: {stats.planningLastFetch === "Never" ? "Never" : new Date(stats.planningLastFetch).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 dark:bg-indigo-950 dark:border-indigo-900 h-full flex flex-col justify-center">
          <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">System Actions</h3>
          <div className="mt-4 flex flex-wrap gap-4">
            <button 
              onClick={handleManualSync}
              disabled={isSyncing}
              className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isSyncing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Syncing...
                </>
              ) : 'Run Manual Sync'}
            </button>
            <button className="px-4 py-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors dark:bg-gray-800 dark:text-indigo-400 dark:border-gray-700">
              Export Data (CSV)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
