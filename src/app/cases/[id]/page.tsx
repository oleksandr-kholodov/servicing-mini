"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

type Loan = {
  id: string;
  loanNumber: string;
  borrowerName: string;
  borrowerEmail: string | null;
  borrowerPhone: string | null;
  propertyAddress: string;
  originalBalance: string;
  currentBalance: string;
  interestRate: string;
  originationDate: string;
  maturityDate: string;
  status: string;
};

type Event = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type Classification = {
  id: string;
  intent: string;
  summary: string;
  confidence: string;
  needsReview: boolean;
  promisedDate: string | null;
  promisedAmount: string | null;
  provider: string;
};

type CaseDetail = {
  loan: Loan;
  events: Event[];
  latestClassification: Classification | null;
};

const EVENT_ICONS: Record<string, string> = {
  loan_imported: "📥",
  email_classified: "✉️",
  status_changed: "🔄",
};

const STATUS_COLORS: Record<string, string> = {
  current: "bg-green-100 text-green-800",
  delinquent: "bg-red-100 text-red-800",
  in_forbearance: "bg-yellow-100 text-yellow-800",
  paid_off: "bg-gray-100 text-gray-700",
  foreclosure: "bg-red-200 text-red-900",
};

const INTENT_COLORS: Record<string, string> = {
  promise_to_pay: "bg-green-50 text-green-800 border-green-200",
  dispute: "bg-red-50 text-red-800 border-red-200",
  hardship: "bg-amber-50 text-amber-800 border-amber-200",
  wrong_contact: "bg-gray-50 text-gray-700 border-gray-200",
  renewal_request: "bg-blue-50 text-blue-800 border-blue-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CasePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const lenderId = searchParams.get("lenderId");
  const id = params["id"] as string;

  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailText, setEmailText] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);

  async function load() {
    if (!lenderId) { setLoading(false); return; }
    const res = await fetch(`/api/cases/${id}?lenderId=${lenderId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [id, lenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClassify(e: React.FormEvent) {
    e.preventDefault();
    setClassifyError(null);
    setClassifying(true);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: id, lenderId, text: emailText }),
      });
      const json = await res.json();
      if (!res.ok) {
        setClassifyError(json.error ?? "Classification failed");
      } else {
        setEmailText("");
        await load();
      }
    } catch (err) {
      setClassifyError(String(err));
    } finally {
      setClassifying(false);
    }
  }

  if (!lenderId) {
    return (
      <div className="space-y-2">
        <Link href="/cases" className="text-sm text-gray-500 hover:text-gray-700 block">← Cases</Link>
        <p className="text-sm text-gray-600">
          No lender context —{" "}
          <Link href="/cases" className="underline hover:text-indigo-600">select a case from the list</Link>.
        </p>
      </div>
    );
  }
  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!data) return <p className="text-sm text-red-600">Case not found.</p>;

  const { loan, events } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/cases" className="text-sm text-gray-500 hover:text-gray-700 mb-1 block">← Cases</Link>
          <h1 className="text-2xl font-bold">{loan.borrowerName}</h1>
          <p className="text-sm text-gray-500 font-mono">{loan.loanNumber}</p>
        </div>
        <span className={`mt-1 px-3 py-1 rounded text-sm font-medium ${STATUS_COLORS[loan.status] ?? ""}`}>
          {loan.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Loan Details */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-md border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-3 uppercase tracking-wide">Loan Details</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Property</dt>
                <dd className="mt-0.5">{loan.propertyAddress}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Original Balance</dt>
                <dd className="mt-0.5 font-medium">
                  ${parseFloat(loan.originalBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Current Balance</dt>
                <dd className="mt-0.5 font-medium">
                  ${parseFloat(loan.currentBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Interest Rate</dt>
                <dd className="mt-0.5">{(parseFloat(loan.interestRate) * 100).toFixed(2)}%</dd>
              </div>
              <div>
                <dt className="text-gray-500">Origination</dt>
                <dd className="mt-0.5">{loan.originationDate}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Maturity</dt>
                <dd className="mt-0.5">{loan.maturityDate}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-md border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-3 uppercase tracking-wide">Borrower</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Name</dt>
                <dd className="mt-0.5">{loan.borrowerName}</dd>
              </div>
              {loan.borrowerEmail && (
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="mt-0.5">{loan.borrowerEmail}</dd>
                </div>
              )}
              {loan.borrowerPhone && (
                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="mt-0.5">{loan.borrowerPhone}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Classify Email */}
          <div className="bg-white rounded-md border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-3 uppercase tracking-wide">Classify Email</h2>
            <form onSubmit={handleClassify} className="space-y-3">
              <textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Paste borrower email text here…"
                rows={5}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-none"
              />
              {classifyError && (
                <p className="text-xs text-red-600">{classifyError}</p>
              )}
              <button
                type="submit"
                disabled={classifying || !emailText.trim()}
                className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {classifying ? "Classifying…" : "Classify"}
              </button>
            </form>
          </div>
        </div>

        {/* Event Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-md border border-gray-200 p-5">
            <h2 className="font-semibold text-sm text-gray-700 mb-4 uppercase tracking-wide">
              Activity Timeline <span className="text-gray-400 font-normal normal-case">(append-only events · state derived)</span>
            </h2>

            {events.length === 0 && (
              <p className="text-sm text-gray-400">No events yet.</p>
            )}

            <div className="relative">
              {events.map((ev, i) => (
                <div key={ev.id} className="flex gap-3 pb-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-base flex-shrink-0">
                      {EVENT_ICONS[ev.type] ?? "•"}
                    </div>
                    {i < events.length - 1 && (
                      <div className="w-px flex-1 bg-gray-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium capitalize">
                        {ev.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-gray-500">{fmt(ev.createdAt)}</span>
                    </div>
                    {ev.type === "email_classified" && (
                      <div className={`mt-1.5 p-2.5 rounded border text-xs ${INTENT_COLORS[(ev.payload["intent"] as string) ?? "other"]}`}>
                        <span className="font-semibold">{String(ev.payload["intent"]).replace(/_/g, " ")}</span>
                        {" — "}
                        {String(ev.payload["summary"])}
                        <span className="ml-2 opacity-60">
                          ({(parseFloat(String(ev.payload["confidence"])) * 100).toFixed(0)}% confidence)
                        </span>
                        {ev.payload["needsReview"] === true && (
                          <span className="ml-2 bg-yellow-200 text-yellow-900 px-1 rounded">needs review</span>
                        )}
                      </div>
                    )}
                    {ev.type === "status_changed" && (
                      <p className="mt-1 text-xs text-gray-600">
                        {String(ev.payload["from"]).replace(/_/g, " ")} → {String(ev.payload["to"]).replace(/_/g, " ")}
                      </p>
                    )}
                    {ev.type === "loan_imported" && (
                      <p className="mt-1 text-xs text-gray-600">
                        {String(ev.payload["action"] ?? "imported")} · {String(ev.payload["filename"] ?? "")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
