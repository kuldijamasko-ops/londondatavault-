import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/staging")({
  component: StagingLayout,
});

function StagingLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      <aside className="w-64 bg-white border-r border-gray-200 dark:bg-gray-800 dark:border-gray-700">
        <div className="p-6">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">LondonRE DataVault</h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Staging Environment</p>
        </div>
        <nav className="mt-6">
          <Link
            to="/staging"
            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-700 [&.active]:bg-indigo-50 [&.active]:text-indigo-600 [&.active]:border-r-4 [&.active]:border-indigo-600"
            activeOptions={{ exact: true }}
          >
            Dashboard
          </Link>
          <Link
            to="/staging/leads"
            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-700 [&.active]:bg-indigo-50 [&.active]:text-indigo-600 [&.active]:border-r-4 [&.active]:border-indigo-600"
          >
            Buyer Leads
          </Link>
          <Link
            to="/staging/properties"
            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-700 [&.active]:bg-indigo-50 [&.active]:text-indigo-600 [&.active]:border-r-4 [&.active]:border-indigo-600"
          >
            Distressed Properties
          </Link>
          <Link
            to="/staging/planning"
            className="flex items-center px-6 py-3 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-700 [&.active]:bg-indigo-50 [&.active]:text-indigo-600 [&.active]:border-r-4 [&.active]:border-indigo-600"
          >
            Planning Alerts
          </Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-gray-200 p-4 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex justify-end">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm text-gray-600 dark:text-gray-400">System Live</span>
            </div>
          </div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
