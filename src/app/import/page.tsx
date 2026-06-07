"use client";

import { useState, useRef } from "react";
import Link from "next/link";

type ImportResult = {
  runId: string;
  filename: string;
  checksum: string;
  totalRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  errorDetails: { row: number; message: string }[];
};

export default function ImportPage() {
  const [lenderId, setLenderId] = useState("acme-mortgage");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleReset() {
    if (
      !window.confirm(
        "Reset the demo to its baseline? This restores 10 Acme + 5 Beacon loans and clears imports & classifications."
      )
    ) {
      return;
    }
    setResetMsg(null);
    setResetting(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setResetMsg(json.error ?? "Reset failed");
      } else {
        setResetMsg("Demo data reset to baseline.");
        setResult(null);
        setError(null);
      }
    } catch (err) {
      setResetMsg(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a CSV file.");
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("lenderId", lenderId);

    setLoading(true);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
      } else {
        setResult(json as ImportResult);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Import Loan Tape</h1>
      <p className="text-sm text-gray-500 mb-4">
        Upload a CSV file. Repeated imports are idempotent — unchanged rows are skipped, updated rows are patched.
      </p>

      <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <p className="text-gray-600">
          <span className="font-medium text-gray-800">Try it:</span> import{" "}
          <code className="rounded bg-gray-200 px-1 text-xs">loans-v2.csv</code> → rows are inserted &amp; updated.
          Import the same file again → everything is <em>unchanged</em> (idempotent, no duplicates).
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Reset demo data"}
          </button>
          <span className="text-xs text-gray-500">Restores the clean baseline (10 Acme + 5 Beacon loans).</span>
          {resetMsg && <span className="text-xs font-medium text-green-700">{resetMsg}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lender ID</label>
          <select
            value={lenderId}
            onChange={(e) => setLenderId(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="acme-mortgage">Acme Mortgage (acme-mortgage)</option>
            <option value="beacon-lending">Beacon Lending (beacon-lending)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Choose CSV file
            </button>
            <span className="text-sm text-gray-500 truncate">
              {fileName ?? "No file selected"}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Download samples:{" "}
            <a href="/samples/loans-v1.csv" className="underline" download>loans-v1.csv</a>
            {" · "}
            <a href="/samples/loans-v2.csv" className="underline" download>loans-v2.csv</a> (with edits)
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Importing…" : "Import"}
        </button>
      </form>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="p-4 bg-white border border-gray-200 rounded-md">
            <h2 className="font-semibold mb-3">Import Result</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-gray-500">Run ID</dt>
              <dd className="font-mono text-xs truncate">{result.runId}</dd>

              <dt className="text-gray-500">File</dt>
              <dd>{result.filename}</dd>

              <dt className="text-gray-500">Checksum</dt>
              <dd className="font-mono text-xs truncate">{result.checksum.slice(0, 16)}…</dd>

              <dt className="text-gray-500">Total rows</dt>
              <dd>{result.totalRows}</dd>

              <dt className="text-gray-500">Inserted</dt>
              <dd className="text-green-700 font-medium">{result.inserted}</dd>

              <dt className="text-gray-500">Updated</dt>
              <dd className="text-blue-700 font-medium">{result.updated}</dd>

              <dt className="text-gray-500">Unchanged</dt>
              <dd className="text-gray-600">{result.unchanged}</dd>

              <dt className="text-gray-500">Errors</dt>
              <dd className={result.errors > 0 ? "text-red-700 font-medium" : ""}>{result.errors}</dd>
            </dl>
          </div>

          {result.errorDetails.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <h3 className="text-sm font-semibold text-red-800 mb-2">Row Errors</h3>
              <ul className="space-y-1 text-xs text-red-700">
                {result.errorDetails.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/cases"
            className="inline-block text-sm text-indigo-600 underline"
          >
            View cases →
          </Link>
        </div>
      )}
    </div>
  );
}
