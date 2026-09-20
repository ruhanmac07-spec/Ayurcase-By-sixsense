'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  HeartPulse,
  Stethoscope,
  Building2,
  ShieldCheck,
  AlertOctagon,
  User,
  RefreshCw,
  FileText,
  Clock,
} from 'lucide-react';
import { UserSession } from '@/types';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [allUsers, setAllUsers] = useState<UserSession[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.user) setCurrentUser(data.user);
      if (data.allUsers) setAllUsers(data.allUsers);
    } catch {
      // Fallback
    }
  };

  const handleSwitchPersona = async (userId: string) => {
    setIsSwitching(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sessionChanged', { detail: data.user }));
        }
        // Direct route based on new role
        if (data.user.role === 'PATIENT') router.push('/patient');
        else if (data.user.role === 'DOCTOR') router.push('/doctor');
        else if (data.user.role === 'HOSPITAL_DOCTOR') router.push('/hospital');
        else if (data.user.role === 'HOSPITAL_ADMIN') router.push('/hospital');
        router.refresh();
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const roleBadgeInfo = (role?: string) => {
    switch (role) {
      case 'PATIENT':
        return { label: 'Patient Portal', color: 'bg-teal-50 text-teal-800 border-teal-300', icon: <User className="w-3.5 h-3.5" /> };
      case 'DOCTOR':
        return { label: 'PHC / Referring Doctor', color: 'bg-blue-50 text-blue-800 border-blue-300', icon: <Stethoscope className="w-3.5 h-3.5" /> };
      case 'HOSPITAL_DOCTOR':
        return { label: 'Hospital Specialist', color: 'bg-purple-50 text-purple-800 border-purple-300', icon: <Building2 className="w-3.5 h-3.5" /> };
      case 'HOSPITAL_ADMIN':
        return { label: 'Hospital Admin', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: <ShieldCheck className="w-3.5 h-3.5" /> };
      default:
        return { label: 'Portal', color: 'bg-slate-100 text-slate-800 border-slate-300', icon: <Activity className="w-3.5 h-3.5" /> };
    }
  };

  const currentBadge = roleBadgeInfo(currentUser?.role);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
      {/* Top Demo Bar for Hackathon Judges */}
      <div className="bg-slate-900 text-slate-200 text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white tracking-wide">TECHNEXA 2026 LIVE DEMO</span>
            <span className="hidden sm:inline text-slate-400">| Quick Role Switcher:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {allUsers.map((u) => {
              const isSelected = currentUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => handleSwitchPersona(u.id)}
                  disabled={isSwitching}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                    isSelected
                      ? 'bg-teal-600 text-white shadow-sm ring-1 ring-white/20'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span>{u.name}</span>
                  <span className="text-[10px] opacity-75">({u.role === 'HOSPITAL_DOCTOR' ? 'Hosp. Doc' : u.role === 'HOSPITAL_ADMIN' ? 'Admin' : u.role})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Platform Name */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-700 to-teal-500 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-lg tracking-tight">CareConnect</span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200">
                  MVP
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Smart Healthcare Access & Referral</p>
            </div>
          </Link>

          {/* Role Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {currentUser?.role === 'PATIENT' && (
              <>
                <Link
                  href="/patient"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/patient' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Home
                </Link>
                <Link
                  href="/patient/assessment"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/patient/assessment' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Check Symptoms
                </Link>
                <Link
                  href="/patient/profile"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/patient/profile' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Health Profile
                </Link>
                <Link
                  href="/patient/documents"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/patient/documents' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Documents (OCR)
                </Link>
                <Link
                  href="/patient/referrals"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/patient/referrals' ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Referrals
                </Link>
              </>
            )}

            {currentUser?.role === 'DOCTOR' && (
              <>
                <Link
                  href="/doctor"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/doctor' ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Clinical Dashboard
                </Link>
                <Link
                  href="/doctor/patients"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/doctor/patients' ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Find Patient
                </Link>
              </>
            )}

            {(currentUser?.role === 'HOSPITAL_DOCTOR' || currentUser?.role === 'HOSPITAL_ADMIN') && (
              <>
                <Link
                  href="/hospital"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/hospital' ? 'bg-purple-50 text-purple-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Hospital Triage HUD
                </Link>
                <Link
                  href="/hospital/facilities"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/hospital/facilities' ? 'bg-purple-50 text-purple-800' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Capability Config
                </Link>
              </>
            )}

            <Link
              href="/audit"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/audit' ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Audit Trail
            </Link>
          </nav>

          {/* Right Action Area */}
          <div className="flex items-center gap-3">
            {/* Active User Badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${currentBadge.color}`}>
              {currentBadge.icon}
              <div className="flex flex-col text-left">
                <span className="font-semibold leading-tight">{currentUser?.name}</span>
                <span className="text-[10px] opacity-75">{currentBadge.label}</span>
              </div>
            </div>

            {/* Permanent Emergency SOS Button for Patient views */}
            <Link
              href="/patient/sos"
              id="global-sos-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all focus:ring-2 focus:ring-red-500 focus:ring-offset-2 animate-pulse-subtle"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>SOS EMERGENCY</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
