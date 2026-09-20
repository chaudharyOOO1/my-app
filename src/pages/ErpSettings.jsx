import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Server, Database } from "lucide-react";

export default function ErpSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Server className="h-5 w-5 text-slate-400" />
            <h1 className="text-base font-semibold text-slate-900">ERP Configuration</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                ERP configuration is being migrated to Supabase
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Employee and attendance data are now connected to the Supabase backend.
                ERP configuration and synchronization controls will be added here after
                the ERP backend is implemented.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
