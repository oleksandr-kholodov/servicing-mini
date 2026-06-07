"use client";

import { useEffect, useState } from "react";

type Loan = {
  id: string;
  loanNumber: string;
  borrowerName: string;
  propertyAddress: string;
  currentBalance: string;
  status: string;
};

const STATUS_COLORS: Record<string, string> = {
  current: "bg-green-100 text-green-800",
  delinquent: "bg-red-100 text-red-800",
  in_forbearance: "bg-yellow-100 text-yellow-800",
  paid_off: "bg-gray-100 text-gray-700",
  foreclosure: "bg-red-200 text-red-900",
};

export default function CasesPage() {
  const [lenderId, setLenderId] = useState("acme-mortgage");
  const [cases, setCases] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cases?lenderId=${lenderId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setCases(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load cases");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lenderId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cases</h1>
        <select
          value={lenderId}
          onChange={(e) => setLenderId(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="acme-mortgage">Acme Mortgage</option>
          <option value="beacon-lending">Beacon Lending</option>
        </select>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {error && !loading && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && cases.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          No cases yet.{" "}
          <a href="/import" className="text-indigo-600 underline">
            Import a loan tape
          </a>{" "}
          to get started.
        </div>
      )}

      {cases.length > 0 && (
        <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Loan #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Borrower</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Property</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.loanNumber}</td>
                  <td className="px-4 py-3">{c.borrowerName}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{c.propertyAddress}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${parseFloat(c.currentBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/cases/${c.id}?lenderId=${lenderId}`}
                      className="text-indigo-600 hover:text-indigo-800 text-xs"
                    >
                      View →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
