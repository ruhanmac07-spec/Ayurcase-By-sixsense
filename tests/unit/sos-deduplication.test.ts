import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('Emergency SOS Lifecycle & Deduplication', () => {
  it('should immediately assign an ambulance upon creation (<1s)', () => {
    const event = db.createEmergencyEvent('pat-1', ['Sudden collapse', 'Unresponsive']);
    
    expect(event.ambulanceStatus).toBe('DISPATCHED');
    expect(event.ambulanceId).toMatch(/^AMB-GJ-01-\d{4}$/);
    expect(event.etaMinutes).toBeGreaterThan(0);
  });

  it('should deduplicate rapid multiple SOS triggers for the same patient', () => {
    // First trigger
    const firstEvent = db.createEmergencyEvent('pat-1', ['Chest pain']);
    
    // Immediate second trigger within 15-minute window
    const secondEvent = db.createEmergencyEvent('pat-1', ['Chest pain worsening']);
    
    expect(secondEvent.id).toBe(firstEvent.id);
    expect(secondEvent.ambulanceId).toBe(firstEvent.ambulanceId);
  });

  it('should handle false-alarm cancellations with audit rationale', () => {
    const event = db.createEmergencyEvent('pat-1', ['Accidental press']);
    const cancelled = db.cancelEmergencyEvent(event.id, 'User clicked SOS by accident');

    expect(cancelled).toBeDefined();
    expect(cancelled?.isCancelled).toBe(true);
    expect(cancelled?.ambulanceStatus).toBe('CANCELLED');
    expect(cancelled?.cancellationReason).toBe('User clicked SOS by accident');
    
    // Check timeline entry
    const lastTimeline = cancelled?.timeline[cancelled.timeline.length - 1];
    expect(lastTimeline?.label).toMatch(/De-escalated|False Alarm|Cancelled/i);
  });
});
