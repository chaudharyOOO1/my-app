```jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Settings } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

import { supabase } from "@/api/supabaseClient";
import { getSession, clearSession } from "@/lib/phoneSession";
import { getCurrentPosition } from "@/lib/geofence";

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
  if (!shiftStart) {
    return "present";
  }

  const [hours, minutes] = shiftStart.split(":").map(Number);

  const checkIn = new Date(checkInIso);
  const grace = new Date(checkIn);

  grace.setHours(hours, minutes + 15, 0, 0);

  return checkIn > grace ? "late" : "present";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [employee, setEmployee] = useState(() => getSession());

  const [todayRecord, setTodayRecord] = useState(null);
  const [records, setRecords] = useState([]);
  const [salaryRecords, setSalaryRecords] = useState([]);

  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    leave: 0,
    absent: 0,
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [geoStatus, setGeoStatus] = useState("idle");
  const [geoDistance, setGeoDistance] = useState(null);

  const [selfieOpen, setSelfieOpen] = useState(false);
  const [punchType, setPunchType] = useState(null);
  const [punchTime, setPunchTime] = useState(null);
  const [punchCoords, setPunchCoords] = useState(null);

  const hasGeofence =
    employee?.site_latitude != null &&
    employee?.site_longitude != null;

  const loadData = useCallback(async () => {
    const emp = getSession();

    if (!emp) {
      navigate("/login");
      return;
    }

    setEmployee(emp);

    try {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", emp.id)
        .order("attendance_date", { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      const attendance = data || [];

      setRecords(attendance);

      const today = todayStr();

      const currentRecord = attendance.find(
        (record) => record.attendance_date === today
      );

      setTodayRecord(currentRecord || null);

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
      const currentMonthPrefix = `${currentYear}-${currentMonth}`;

      const monthAttendance = attendance.filter((record) =>
        record.attendance_date?.startsWith(currentMonthPrefix)
      );

      setStats({
        present: monthAttendance.filter(
          (record) => record.status === "present"
        ).length,

        late: monthAttendance.filter(
          (record) => record.status === "late"
        ).length,

        leave: monthAttendance.filter(
          (record) => record.status === "leave"
        ).length,

        absent: monthAttendance.filter(
          (record) => record.status === "absent"
        ).length,
      });

      /*
       * Salary migration will be handled separately.
       * Keeping this empty prevents the existing salary component
       * from receiving old Base44 data.
       */
      setSalaryRecords([]);
    } catch (error) {
      console.error("Failed to load attendance:", error);

      toast({
        title: "Failed to load data",
        description:
          error?.message || "Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setInitialLoading(false);
    }
  }, [navigate, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const earthRadius = 6371000;

    const latitude1 = (lat1 * Math.PI) / 180;
    const latitude2 = (lat2 * Math.PI) / 180;

    const deltaLatitude =
      ((lat2 - lat1) * Math.PI) / 180;

    const deltaLongitude =
      ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(latitude1) *
        Math.cos(latitude2) *
        Math.sin(deltaLongitude / 2) ** 2;

    const c =
      2 *
      Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  };

  const startPunch = async (type) => {
    setLoading(true);
    setPunchType(type);

    try {
      const now = new Date().toISOString();

      let coords = null;

      /*
       * GPS is advisory only.
       * Attendance is never blocked if GPS is unavailable.
       */
      try {
        coords = await getCurrentPosition();
      } catch (error) {
        console.warn("GPS unavailable:", error);
      }

      /*
       * Show geofence status if site coordinates exist.
       * Being outside the radius does NOT block attendance.
       */
      if (hasGeofence && coords) {
        const distance = Math.round(
          calculateDistance(
            coords.lat,
            coords.lng,
            Number(employee.site_latitude),
            Number(employee.site_longitude)
          )
        );

        setGeoDistance(distance);

        const radius = Number(
          employee.geofence_radius || 200
        );

        if (distance > radius) {
          setGeoStatus("outside");
        } else {
          setGeoStatus("inside");
        }
      } else {
        setGeoStatus("idle");
        setGeoDistance(null);
      }

      setPunchTime(now);
      setPunchCoords(coords);
      setSelfieOpen(true);
    } catch (error) {
      console.error("Punch preparation failed:", error);

      toast({
        title:
          type === "check-in"
            ? "Check-in failed"
            : "Check-out failed",
        description:
          error?.message || "Please try again.",
        variant: "destructive",
      });

      setPunchType(null);
    } finally {
      setLoading(false);
    }
  };

  const uploadSelfie = async (
    file,
    type,
    attendanceDate
  ) => {
    if (!file) {
      throw new Error("Selfie file is missing.");
    }

    const filePath =
      `${employee.id}/${attendanceDate}/${type}-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("employee-selfies")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: "image/jpeg",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data } = supabase.storage
      .from("employee-selfies")
      .getPublicUrl(filePath);

    if (!data?.publicUrl) {
      throw new Error("Could not create selfie URL.");
    }

    return data.publicUrl;
  };

  const handleSelfieConfirm = async (file) => {
    setSelfieOpen(false);
    setLoading(true);

    try {
      if (!employee?.id) {
        throw new Error("Employee session is missing.");
      }

      const attendanceDate = todayStr();

      /*
       * CHECK-IN
       */
      if (punchType === "check-in") {
        if (todayRecord) {
          toast({
            title: "Already checked in",
            description:
              "Today's attendance record already exists.",
          });

          return;
        }

        const selfieUrl = await uploadSelfie(
          file,
          "check-in",
          attendanceDate
        );

        const checkInTime =
          punchTime || new Date().toISOString();

        const status = computeStatus(
          checkInTime,
          employee.shift_start
        );

        const { data, error } = await supabase
          .from("attendance")
          .insert({
            employee_id: employee.id,
            attendance_date: attendanceDate,
            check_in_time: checkInTime,
            check_in_selfie_url: selfieUrl,
            check_in_latitude:
              punchCoords?.lat ?? null,
            check_in_longitude:
              punchCoords?.lng ?? null,
            check_in_accuracy:
              punchCoords?.accuracy ?? null,
            status,
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        setTodayRecord(data);
        setRecords((previous) => [
          data,
          ...previous,
        ]);

        toast({
          title: "Checked in",
          description: "Have a great day!",
        });

        return;
      }

      /*
       * CHECK-OUT
       */
      if (punchType === "check-out") {
        if (!todayRecord) {
          toast({
            title: "Check-out unavailable",
            description:
              "Today's check-in record was not found.",
            variant: "destructive",
          });

          return;
        }

        if (todayRecord.check_out_time) {
          toast({
            title: "Already checked out",
            description:
              "Today's attendance is already completed.",
          });

          return;
        }

        const selfieUrl = await uploadSelfie(
          file,
          "check-out",
          attendanceDate
        );

        const checkOutTime =
          punchTime || new Date().toISOString();

        const { data, error } = await supabase
          .from("attendance")
          .update({
            check_out_time: checkOutTime,
            check_out_selfie_url: selfieUrl,
            check_out_latitude:
              punchCoords?.lat ?? null,
            check_out_longitude:
              punchCoords?.lng ?? null,
            check_out_accuracy:
              punchCoords?.accuracy ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", todayRecord.id)
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        setTodayRecord(data);

        setRecords((previous) =>
          previous.map((record) =>
            record.id === data.id
              ? data
              : record
          )
        );

        let description =
          "Your attendance has been updated.";

        if (
          data.check_in_time &&
          data.check_out_time
        ) {
          const checkIn = new Date(
            data.check_in_time
          );

          const checkOut = new Date(
            data.check_out_time
          );

          const hours =
            (checkOut.getTime() -
              checkIn.getTime()) /
            3600000;

          description =
            `Worked ${hours.toFixed(2)} hrs`;
        }

        toast({
          title: "Checked out",
          description,
        });
      }
    } catch (error) {
      console.error(
        "Attendance operation failed:",
        error
      );

      toast({
        title:
          punchType === "check-in"
            ? "Check-in failed"
            : "Check-out failed",

        description:
          error?.message ||
          "Something went wrong. Please try again.",

        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setPunchType(null);
      setPunchTime(null);
      setPunchCoords(null);
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

  if (!employee) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Clock className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-900">
                FAS
              </h1>

              <p className="text-xs text-slate-500">
                Fortellus Allied Services
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                navigate("/erp-settings")
              }
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4" />
              ERP Settings
            </button>

            <button
              onClick={handleSignOut}
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
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
              onLogin={() =>
                startPunch("check-in")
              }
              onLogout={() =>
                startPunch("check-out")
              }
              loading={loading}
              geoStatus={geoStatus}
              geoDistance={geoDistance}
              hasGeofence={hasGeofence}
            />

            <AttendanceSummary stats={stats} />

            <AttendanceCalendar
              records={records}
            />

            <AttendanceHistory
              records={records}
            />
          </div>

          <div className="space-y-6">
            <EmployeeProfile
              employee={employee}
            />

            <SalaryCard
              employee={employee}
              salaryRecords={salaryRecords}
            />
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
        place={null}
      />
    </div>
  );
}
```
