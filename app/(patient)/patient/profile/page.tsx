'use client';

import React, { useState, useEffect } from 'react';
import {
  User,
  HeartPulse,
  AlertTriangle,
  Pill,
  Save,
  CheckCircle2,
  PhoneCall,
  ShieldCheck,
  Plus,
  Trash2,
} from 'lucide-react';
import { PatientProfile } from '@/types';

export default function PatientProfilePage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [age, setAge] = useState(0);
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [mobile, setMobile] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [weightKg, setWeightKg] = useState<number | undefined>(undefined);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [allergiesText, setAllergiesText] = useState('');
  const [existingConditionsText, setExistingConditionsText] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/patient');
        const data: PatientProfile = await res.json();
        setProfile(data);

        setName(data.name);
        setAge(data.age);
        setGender(data.gender);
        setMobile(data.mobile);
        setLocation(data.location);
        setAddress(data.address);
        setBloodGroup(data.bloodGroup || '');
        setWeightKg(data.weightKg);
        setEmergencyContactName(data.emergencyContact?.name || '');
        setEmergencyContactRelation(data.emergencyContact?.relationship || '');
        setEmergencyContactPhone(data.emergencyContact?.phone || '');
        setAllergiesText(data.allergies.join('\n'));
        setExistingConditionsText(data.existingConditions.join('\n'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsSaving(true);
    setSavedSuccess(false);

    try {
      const updatedAllergies = allergiesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const updatedConditions = existingConditionsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/patient', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: profile.id,
          updates: {
            name,
            age: Number(age),
            gender,
            mobile,
            location,
            address,
            bloodGroup: bloodGroup || undefined,
            weightKg: weightKg ? Number(weightKg) : undefined,
            emergencyContact: {
              name: emergencyContactName,
              relationship: emergencyContactRelation,
              phone: emergencyContactPhone,
            },
            allergies: updatedAllergies,
            existingConditions: updatedConditions,
          },
        }),
      });

      const updated = await res.json();
      setProfile(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
            Health Record
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            Patient Health Profile
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Maintain accurate health information for emergency responders and referring doctors.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Profile Updated Successfully</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Demographics */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600" />
            <span>Personal & Contact Information</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Age (Years)</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium bg-white"
              >
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Mobile Number</label>
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Blood Group (Optional)</label>
              <input
                type="text"
                placeholder="e.g. B+, O+, A-"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Weight in kg (Optional)</label>
              <input
                type="number"
                placeholder="e.g. 74"
                value={weightKg || ''}
                onChange={(e) => setWeightKg(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
              />
            </div>

            <div className="space-y-1 sm:col-span-3">
              <label className="font-semibold text-slate-700">Residential Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 font-medium"
                required
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-blue-600" />
            <span>Emergency Contact Person</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Contact Name</label>
              <input
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Relationship</label>
              <input
                type="text"
                placeholder="e.g. Spouse, Parent, Brother"
                value={emergencyContactRelation}
                onChange={(e) => setEmergencyContactRelation(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-700">Emergency Phone</label>
              <input
                type="text"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>
          </div>
        </div>

        {/* Clinical History & Allergies */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Allergies (Must be prominently marked) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200 bg-amber-50/20 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Known Drug Allergies (One per line)</span>
            </div>
            <p className="text-[11px] text-amber-800">
              Crucial: Emergency doctors check this before administering antibiotics or anesthesia.
            </p>
            <textarea
              rows={4}
              value={allergiesText}
              onChange={(e) => setAllergiesText(e.target.value)}
              className="w-full p-3 rounded-xl border border-amber-300 focus:ring-2 focus:ring-amber-500 text-xs font-semibold text-amber-950 bg-white leading-relaxed"
              placeholder="e.g. Sulfa Drugs (Skin Rash)&#10;Penicillin (Anaphylaxis)"
            />
          </div>

          {/* Existing Conditions */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <HeartPulse className="w-4 h-4 text-teal-600" />
              <span>Existing Medical Conditions (One per line)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Chronic conditions like hypertension, diabetes, or asthma.
            </p>
            <textarea
              rows={4}
              value={existingConditionsText}
              onChange={(e) => setExistingConditionsText(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 text-xs font-medium text-slate-900 bg-white leading-relaxed"
              placeholder="e.g. Essential Hypertension&#10;Type 2 Diabetes"
            />
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-md transition-all hover:scale-[1.01]"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving Profile...' : 'Save Health Profile'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
