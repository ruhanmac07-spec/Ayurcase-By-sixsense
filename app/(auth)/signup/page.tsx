'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HeartPulse, CheckCircle2, User, Phone, ShieldCheck } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [age, setAge] = useState(30);
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [mobile, setMobile] = useState('');
  const [location, setLocation] = useState('Anand, Gujarat');
  const [consentGranted, setConsentGranted] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // In this MVP prototype, patient profile is initialized and routes to patient dashboard
      router.push('/patient');
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
          <h1 className="text-2xl font-extrabold text-slate-900">Create Patient Profile</h1>
          <p className="text-xs text-slate-500">Register your digital health identity for care coordination</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700">Full Name</label>
            <input
              type="text"
              placeholder="e.g. Ramesh Patel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-700">Age</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium bg-white"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Mobile Number</label>
            <input
              type="text"
              placeholder="+91 98250 12345"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Location / City</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium"
              required
            />
          </div>

          {/* Consent Checkbox */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5">
            <input
              type="checkbox"
              id="consent"
              checked={consentGranted}
              onChange={(e) => setConsentGranted(e.target.checked)}
              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
            />
            <label htmlFor="consent" className="text-[11px] text-slate-600 leading-relaxed cursor-pointer">
              I authorize authorized healthcare professionals and emergency responders to access my clinical history during medical encounters.
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-md transition-all"
          >
            {isSubmitting ? 'Creating Profile...' : 'Complete Registration'}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500 pt-2">
          Already registered?{' '}
          <Link href="/login" className="text-teal-700 font-bold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
