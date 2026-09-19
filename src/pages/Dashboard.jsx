import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Clock, Settings } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getSession, clearSession } from "@/lib/phoneSession";
import { getCurrentPosition, haversineDistance } from "@/lib/geofence";
import CheckInCard from "@/components/CheckInCard";
import EmployeeProfile from "@/components/EmployeeProfile";
import AttendanceSummary from "@/components/AttendanceSummary";
import SalaryCard from "@/components/SalaryCard";
import AttendanceHistory from "@/components/AttendanceHistory";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import SelfieCapture from "@/components/SelfieCapture";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function computeStatus(checkInIso, shiftStart) {
  if (!shiftStart) return "present";
  const [h, m] = shiftStart.split(":").map(Number);
  const checkIn = new Date(checkInIso);
  const grace = new Date(checkIn);
  grace.setHours(h, m + 15, 0, 0);
  return checkIn > grace ? "late" : "present";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employee, setEmployee] = useState(() => getSession());
  const [todayRecord, setTodayRecord] = useState(null);
  const [records, setRecords] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);
  const [stats, setStats] = useState({ present: 0, late: 0, leave: 0, absent: 0 });
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [geoDistance, setGeoDistance] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [punchTime, setPunchTime] = useState(null);
  const [punchCoords, setPunchCoords] = useState(null);
  const [punchPlace, setPunchPlace] = useState(null);

  const hasGeofence = employee?.site_latitude != null && employee?.site_longitude != null;

  const loadData = useCallback(async () => {
    const emp = getSession();
    if (!emp) {
      navigate("/login");
      return;
    }
    setEmployee(emp);
    try {
      const today = todayStr();
      const [att, salaries] = await Promise.all([
        base44.entities.Attendance.filter({ employee_id: emp.id }, "-date", 100),
        base44.entities.SalaryRecord.filter({ employee_id: emp.id }, "-month", 50),
      ]);

      setRecords(att);
      setTodayRecord(att.find((r) => r.date === today) || null);

      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthAtt = att.filter((r) => r.date?.startsWith(ym));
      setStats({
        present: monthAtt.filter((r) => r.status === "present").length,
        late: monthAtt.filter((r) => r.status === "late").length,
        leave: monthAtt.filter((r) => r.status === "leave").length,
        absent: monthAtt.filter((r) => r.status === "absent").length,
      });

      setSalaryRecords(salaries);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load data", variant: "destructive" });
    } finally {
      setInitialLoading(false);
    }
  }, [toast, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      if (hasGeofence) setGeoStatus("checking");

      let coords = null;
      try {
        coords = await getCurrentPosition();
      } catch {
        // Location is only advisory — punching is never blocked.
        if (hasGeofence) setGeoStatus("denied");
      }

      if (hasGeofence && coords) {
        const distance = Math.round(
          haversineDistance(coords.lat, coords.lng, employee.site_latitude, employee.site_longitude)
        );
        if (distance > (employee.geofence_radius || 200)) {
          setGeoStatus("outside");
          setGeoDistance(distance);
        } else {
          setGeoStatus("inside");
        }
      }

      let place = null;
      if (coords) {
        try {
          const geo = await base44.functions.invoke("reverseGeocode", {
            lat: coords.lat,
            lng: coords.lng,
          });
          place = geo.data?.place || null;
        } catch {
          place = null;
        }
      }

      setPunchCoords(coords);
      setPunchPlace(place);
      setPunchTime(new Date().toISOString());
      setSelfieOpen(true);
    } catch {
      toast({ title: "Login failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSelfieConfirm = async (file) => {
    setSelfieOpen(false);
    setLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      const stampedAt = punchTime || new Date().toISOString();
      const created = await base44.entities.Attendance.create({
        employee_id: employee.id,
        employee_name: employee.name,
        date: todayStr(),
        check_in_time: stampedAt,
        status: computeStatus(stampedAt, employee.shift_start),
        photo_url: file_url,
        location_name: punchPlace || undefined,
        latitude: punchCoords?.lat,
        longitude: punchCoords?.lng,
        location_accuracy: punchCoords?.accuracy,
      });
      setTodayRecord(created);
      setRecords((prev) => [created, ...prev]);
      toast({ title: "Logged in", description: "Have a great day!" });
    } catch {
      toast({ title: "Login failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!todayRecord) return;
    setLoading(true);
    try {
      const now = new Date();
      const inTime = new Date(todayRecord.check_in_time);
      const hours = (now - inTime) / 3600000;
      const updated = await base44.entities.Attendance.update(todayRecord.id, {
        check_out_time: now.toISOString(),
        work_hours: Number(hours.toFixed(2)),
      });
      setTodayRecord(updated);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast({ title: "Logged out", description: `Worked ${hours.toFixed(2)} hrs` });
    } catch {
      toast({ title: "Logout failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    clearSession();
    navigate("/login");
  };

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-900">FAS</h1>
              <p className="text-xs text-slate-500">Fortellus Allied Services</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/erp-settings")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4" />
              ERP Settings
            </button>
            <button onClick={handleSignOut} className="text-sm font-medium text-slate-500 hover:text-slate-900">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="grid gap-6 lg:grid-cols-3"
        >
          <div className="space-y-6 lg:col-span-2">
            <CheckInCard
              todayRecord={todayRecord}
              onLogin={handleLogin}
              onLogout={handleLogout}
              loading={loading}
              geoStatus={geoStatus}
              geoDistance={geoDistance}
              hasGeofence={hasGeofence}
            />
            <AttendanceSummary stats={stats} />
            <AttendanceCalendar records={records} />
            <AttendanceHistory records={records} />
          </div>

          <div className="space-y-6">
            <EmployeeProfile employee={employee} />
            <SalaryCard employee={employee} salaryRecords={salaryRecords} />
          </div>
        </motion.div>
      </main>

      <SelfieCapture
        open={selfieOpen}
        onOpenChange={setSelfieOpen}
        onConfirm={handleSelfieConfirm}
        busy={loading}
        punchTime={punchTime}
        coords={punchCoords}
        place={punchPlace}
      />
    </div>
  );
}