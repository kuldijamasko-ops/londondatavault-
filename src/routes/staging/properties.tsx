import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getProperties, getBoroughs } from "../../services/staging";
import { useState, useEffect } from "react";

type PropertySearch = {
  borough?: string;
  category?: string;
  search?: string;
};

export const Route = createFileRoute("/staging/properties")({
  validateSearch: (search: Record<string, unknown>): PropertySearch => {
    return {
      borough: search.borough as string || undefined,
      category: search.category as string || undefined,
      search: search.search as string || undefined,
    };
  },
  loader: async ({ search }) => {
    const [properties, boroughs] = await Promise.all([
      getProperties({ data: search }),
      getBoroughs(),
    ]);
    return { properties, boroughs };
  },
  component: PropertiesPage,
});

function PropertiesPage() {
  const { properties, boroughs } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/staging/properties" });
  const [localSearch, setLocalSearch] = useState(search.search || "");

  useEffect(() => {
    setLocalSearch(search.search || "");
  }, [search.search]);

  const handleFilterChange = (key: keyof PropertySearch, value: string) => {
    navigate({
      search: (prev: any) => ({
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Distressed Properties</h2>
          <p className="text-gray-600 dark:text-gray-400">Surfaced from insolvency notices and liquidation filings.</p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex flex-1 max-w-md gap-2">
          <input
            type="text"
            placeholder="Search address or description..."
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
            {boroughs.map((b: any) => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
          </select>
          <select
            className="bg-white border border-gray-300 text-gray-700 text-sm rounded-lg p-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            value={search.category || ""}
            onChange={(e) => handleFilterChange("category", e.target.value)}
          >
            <option value="">All Categories</option>
            <option value="Commercial">Commercial</option>
            <option value="Residential Development">Residential Development</option>
            <option value="Rental Portfolio">Rental Portfolio</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {properties.map((prop) => (
          <div key={prop.id} className="bg-white p-6 shadow-sm border border-gray-200 rounded-xl flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                  prop.status === 'bankruptcy' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 
                  prop.status === 'liquidation' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                }`}>
                  {prop.status.replace('_', ' ')}
                </span>
                <span className="text-sm text-gray-500 uppercase font-medium">{prop.source}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{prop.property_address}</h3>
              <p className="text-indigo-600 font-medium dark:text-indigo-400">{prop.borough} • {prop.asset_category}</p>
              <p className="mt-3 text-gray-600 dark:text-gray-400 line-clamp-2">{prop.description}</p>
            </div>
            <div className="flex flex-col justify-between items-end min-w-[150px]">
              <span className="text-sm text-gray-500">Flagged: {new Date(prop.flagged_at).toLocaleDateString()}</span>
              <a 
                href={prop.source_url} 
                target="_blank" 
                rel="noreferrer"
                className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                View Source
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
