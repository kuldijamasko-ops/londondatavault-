import { createFileRoute } from "@tanstack/react-router";
import { getPlanningFeeds } from "../../services/staging";

export const Route = createFileRoute("/staging/planning")({
  loader: () => getPlanningFeeds(),
  component: PlanningPage,
});

function PlanningPage() {
  const { items, feeds } = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Planning & Zoning Alerts</h2>
        <p className="text-gray-600 dark:text-gray-400">Live monitoring of government planning datasets and official notices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-800 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 dark:text-white">Recent Alerts</h3>
              <span className="text-xs text-gray-500">{items.length} items surfaced</span>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No live alerts found. Try running a manual sync from the dashboard.</p>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors dark:hover:bg-gray-700">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{item.source}</span>
                      <span className="text-xs text-gray-400">{new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">{item.title}</h4>
                    <div className="flex justify-between items-center">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] dark:bg-gray-700 dark:text-gray-400">
                        {item.type}
                      </span>
                      <a 
                        href={item.link} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline font-medium"
                      >
                        View Original ↗
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 shadow-sm border border-gray-200 rounded-xl dark:bg-gray-800 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Feed Connections</h3>
            <div className="space-y-4">
              {feeds.map((feed) => (
                <div key={feed.name} className="flex items-start gap-3">
                  <div className="mt-1 w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{feed.name}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[200px]">{feed.url}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Last sync: {new Date(feed.fetched_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {feeds.length === 0 && (
                <p className="text-sm text-gray-500 italic">No feed connection history found.</p>
              )}
            </div>
          </div>

          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 dark:bg-indigo-950 dark:border-indigo-900">
            <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-2">Integration Note</h4>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
              These alerts are pulled directly from government data endpoints. High-priority planning changes are automatically flagged and moved to the Distressed Properties staging area for review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
