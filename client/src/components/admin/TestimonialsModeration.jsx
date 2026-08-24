import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import apiClient from "../../services/apiClient.js";

const STATUS_FILTERS = ["pending", "approved", "rejected", "all"];

export default function TestimonialsModeration() {
  const [status, setStatus] = useState("pending");
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = { page: 1, limit: 50 };
      if (status !== "all") params.status = status;
      const { data } = await apiClient.get("/api/admin/testimonials", {
        params,
      });
      setTestimonials(data.testimonials || []);
      setSelectedIds([]); // Reset selection on load
    } catch {
      setError("Unable to load testimonials for moderation.");
      setTestimonials([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const executeBulkStatus = async ({ ids, status }) => {
    await apiClient.post(`/api/admin/testimonials/bulk-status`, {
      ids,
      status,
    });
    toast.success(`Action applied successfully`);
  };

  const executeSpotlightConfig = async (id, payload) => {
    await apiClient.put(`/api/admin/testimonials/${id}/spotlight`, payload);
    toast.success(`Spotlight updated`);
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === testimonials.length && testimonials.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(testimonials.map((t) => t.id || t._id));
    }
  };

  const handleBulkAction = async (statusAction) => {
    if (selectedIds.length === 0) return;
    setIsProcessing(true);
    try {
      await executeBulkStatus({ ids: selectedIds, status: statusAction });
      setSelectedIds([]);
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Failed to perform bulk action");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSpotlightToggle = async (testimonial) => {
    try {
      await executeSpotlightConfig(testimonial.id || testimonial._id, {
        isFeatured: !testimonial.isFeatured,
        displayOrder: testimonial.displayOrder || 0,
      });
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update spotlight");
    }
  };

  const handleOrderChange = async (id, currentFeatured, newOrderValue) => {
    try {
      await executeSpotlightConfig(id, {
        isFeatured: currentFeatured,
        displayOrder: parseInt(newOrderValue, 10) || 0,
      });
      await load();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update order");
    }
  };

  return (
    <div className="w-full space-y-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex flex-wrap gap-2" role="tablist">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize cursor-pointer ${
              status === value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            Testimonials Review Pipeline
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Selected: {selectedIds.length} records
          </p>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold animate-fadeIn">
            <button
              onClick={() => handleBulkAction("APPROVED")}
              disabled={isProcessing}
              className="px-2.5 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
            >
              Approve Set
            </button>
            <button
              onClick={() => handleBulkAction("REJECTED")}
              disabled={isProcessing}
              className="px-2.5 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
            >
              Reject Set
            </button>
            <button
              onClick={() => handleBulkAction("DELETE")}
              disabled={isProcessing}
              className="px-2.5 py-1 bg-rose-600 text-white rounded hover:bg-rose-700 transition-colors"
            >
              Purge
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((k) => (
            <div
              key={k}
              className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : testimonials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-10 text-center text-sm text-slate-500">
          No testimonials in this filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-400 uppercase font-bold tracking-wider border-b border-slate-100 dark:border-slate-700">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      testimonials.length > 0 &&
                      selectedIds.length === testimonials.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                </th>
                <th className="p-3">Author</th>
                <th className="p-3">Message Snippet</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Spotlight Feature</th>
                <th className="p-3 w-24">Display Rank</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {testimonials.map((t) => {
                const id = t.id || t._id;
                return (
                  <tr
                    key={id}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 ${selectedIds.includes(id) ? "bg-blue-50/20 dark:bg-blue-900/20" : ""}`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(id)}
                        onChange={() => toggleSelectRow(id)}
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                    </td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">
                      {t.user?.name || "Unknown user"}
                    </td>
                    <td className="p-3 max-w-xs truncate text-slate-500 dark:text-slate-400">
                      {t.comment}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                          t.status === "approved"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : t.status === "rejected"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleSpotlightToggle(t)}
                        disabled={t.status !== "approved"}
                        className={`text-base focus:outline-none disabled:opacity-30 ${t.isFeatured ? "text-amber-500 scale-110" : "text-slate-300 dark:text-slate-600 hover:text-slate-400"}`}
                        title={
                          t.status !== "approved"
                            ? "Approve testimonial first before featuring"
                            : "Toggle spotlight highlight"
                        }
                      >
                        ★
                      </button>
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        min="0"
                        disabled={!t.isFeatured}
                        value={t.displayOrder || 0}
                        onChange={(e) =>
                          handleOrderChange(id, t.isFeatured, e.target.value)
                        }
                        className="w-16 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 text-center font-mono font-medium text-slate-700 dark:text-slate-300 disabled:opacity-40"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
