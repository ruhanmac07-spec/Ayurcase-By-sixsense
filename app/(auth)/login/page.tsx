'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HeartPulse,
  User,
  Stethoscope,
  Building2,
  ShieldCheck,
  ArrowRight,
  Lock,
  Phone,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState('+91 98250 12345');
  const [password, setPassword] = useState('password123');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Direct login as Ramesh Patel (default patient)
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-patient-1' }),
      });
      if (res.ok) router.push('/patient');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickRoleLogin = async (userId: string, targetPath: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) router.push(targetPath);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8 space-y-6">
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-sm">
            <HeartPulse className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Sign In to CareConnect</h1>
          <p className="text-xs text-slate-500">Access connected healthcare, referrals & emergency fast-lane</p>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700">Mobile Number</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Password / OTP</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-md transition-all"
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In as Patient'}
          </button>
        </form>

        {/* Quick Demo Persona Pickers */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block text-center">
            Or Sign In With Demo Persona:
          </span>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <button
              onClick={() => handleQuickRoleLogin('usr-doctor-1', '/doctor')}
              className="p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <Stethoscope className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="font-bold text-slate-900">Dr. Priya Sharma</div>
                  <div className="text-[10px] text-slate-400">PHC Medical Officer (Referring Doctor)</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => handleQuickRoleLogin('usr-hospital-doc-1', '/hospital')}
              className="p-3 rounded-xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 transition-all flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-purple-600" />
                <div>
                  <div className="font-bold text-slate-900">Dr. Rajesh Mehta</div>
                  <div className="text-[10px] text-slate-400">Hospital Cardiologist (Receiving Provider)</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              onClick={() => handleQuickRoleLogin('usr-hospital-admin-1', '/hospital')}
              className="p-3 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-slate-600" />
                <div>
                  <div className="font-bold text-slate-900">Amit Desai</div>
                  <div className="text-[10px] text-slate-400">Hospital Administrator</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 pt-2">
          New patient?{' '}
          <Link href="/signup" className="text-teal-700 font-bold hover:underline">
            Register for Digital Health ID
          </Link>
        </div>
      </div>
    </div>
  );
}
