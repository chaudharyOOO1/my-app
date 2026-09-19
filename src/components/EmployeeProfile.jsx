import React from "react";
import { motion } from "framer-motion";
import { Building2, CalendarDays, Clock, BadgeCheck, User, IdCard } from "lucide-react";

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-900">{value || "—"}</p>
      </div>
    </div>
  );
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function EmployeeProfile({ employee }) {
  const shift = employee.shift_start && employee.shift_end
    ? `${employee.shift_start} – ${employee.shift_end}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
    >
      <div className="flex items-center gap-4 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white ring-1 ring-white/20">
          {employee.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-white">{employee.name}</h2>
          <p className="truncate text-sm text-slate-300">{employee.designation || "Employee"}</p>
        </div>
        {employee.status === "active" && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/20">
            <BadgeCheck className="h-3.5 w-3.5" />
            Active
          </span>
        )}
      </div>

      <div className="divide-y divide-slate-50 px-6">
        <InfoRow icon={IdCard} label="Employee Code" value={employee.employee_code} />
        <InfoRow icon={User} label="Designation" value={employee.designation} />
        <InfoRow icon={CalendarDays} label="Date of Joining" value={formatDate(employee.doj)} />
        <InfoRow icon={Building2} label="Assigned Site" value={employee.assigned_site} />
        <InfoRow icon={Clock} label="Shift Timing" value={shift} />
      </div>
    </motion.div>
  );
}