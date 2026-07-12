import { createFileRoute, useRouter, useNavigate } from "@tanstack/react-router";
import { getLeads, unlockLead, getBoroughs } from "../../services/staging";
import { useState, useEffect } from "react";

type LeadSearch = {
  borough?: string;
  search?: string;
};

export const Route = createFileRoute("/staging/leads")({
  validateSearch: (search: Record<string, unknown>): LeadSearch => {
    return {
      borough: search.borough as string || undefined,
      search: search.search as string || undefined,
    };
  },
  loader: async ({ search }) => {
    const [leads, boroughs] = await Promise.all([
      getLeads({ data: search }),
      getBoroughs(),
    ]);
    return { leads, boroughs };
  },
  component: LeadsPage,
});

function LeadsPage() {
  const { leads: initialLeads, boroughs } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/staging/leads" });
  const [leads, setLeads] = useState(initialLeads);
  const [localSearch, setLocalSearch] = useState(search.search || "");
  const router = useRouter();

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    setLocalSearch(search.search || "");
  }, [search.search]);

  const handleUnlock = async (id: string) => {
    await unlockLead({ data: id });
    // Update local state for immediate feedback
    setLeads(leads.map(l => l.id === id ? { ...l, locked: 0 } : l));
    // Invalidate the router to keep it in sync with the server
    router.invalidate();
  };

  const handleFilterChange = (key: keyof LeadSearch, value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        [key]: value || undefined,
      }),
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFilterChange("search", localSearch);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">International Buyer Leads</h2>
          <p className="text-gray-600 dark:text-gray-400">Locked leads require owner validation before contact details are revealed.</p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex flex-1 max-w-md gap-2">
          <input
            type="text"
            placeholder="Search origin, area or category..."
            className="flex-1 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
          <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            Search
          </button>
        </form>
        <div className="flex gap-2">
          <select
            className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            value={search.borough || ""}
            onChange={(e) => handleFilterChange("borough", e.target.value)}
          >
            <option value="">All Boroughs</option>
            {boroughs.map((b) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origin</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target Area</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact Details</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{lead.buyer_origin}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{lead.budget}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{lead.target_area}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">{lead.asset_category}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                  {lead.locked ? (
                    <span className="flex items-center gap-1 text-orange-600 font-medium">
                      <span>🔒</span> Locked
                    </span>
                  ) : (
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{lead.contact_name}</p>
                      <p className="text-xs">{lead.contact_email}</p>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {lead.locked ? (
                    <button
                      onClick={() => handleUnlock(lead.id)}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      Unlock
                    </button>
                  ) : (
                    <span className="text-green-600">Unlocked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
