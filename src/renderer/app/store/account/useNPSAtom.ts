import { backendUrl } from '@/renderer/app/lib/backendUrl';
import { atom, useAtom } from 'jotai';
import { useState } from 'react';
import { toast } from 'sonner';

export type NPSEventType =
  | 'feature_usage'
  | 'support_interaction'
  | 'onboarding_complete'
  | 'general_feedback'
  | 'product_update'
  | 'third_email';

export interface NPSEntry {
  id: string;
  score: number; // 0-10 NPS score
  comment?: string;
  userEmail?: string;
  eventType?: NPSEventType;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

export interface NPSCreateRequest {
  score: number;
  comment?: string;
  eventType?: NPSEventType;
  userEmail?: string; // Optional if not provided in auth
}

export interface INPSInfo {
  entries: NPSEntry[];
  currentEntry: NPSEntry | null;
  totalCount: number;
  averageScore: number | null;
}

export const npsInfoAtom = atom<INPSInfo>({
  entries: [],
  currentEntry: null,
  totalCount: 0,
  averageScore: null
});

export function useNPSAtom() {
  const [npsInfo, setNPSInfo] = useAtom(npsInfoAtom);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNPSEntries = async (idToken: string) => {
    setLoading(true);
    setError(null);

    try {
      if (!idToken) {
        throw new Error('Authentication token not available');
      }

      const response = await fetch(`${backendUrl()}/nps/entries`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error: ${response.status}`);
      }

      const data = await response.json();
      const entries = data.entries?.map(transformNPSEntry) || [];

      // Calculate average score
      const averageScore =
        entries.length > 0
          ? entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length
          : null;

      setNPSInfo({
        entries,
        currentEntry: entries[0] || null, // Most recent entry
        totalCount: data.totalCount || entries.length,
        averageScore
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch NPS entries';
      setError(errorMessage);
      console.error('Error fetching NPS entries:', err);
    } finally {
      setLoading(false);
    }
  };

  const createNPSEntry = async (idToken: string, npsData: NPSCreateRequest) => {
    setSubmitting(true);
    setError(null);

    try {
      if (!idToken) {
        throw new Error('Authentication token not available');
      }

      // Validate score range
      if (npsData.score < 0 || npsData.score > 10) {
        throw new Error('NPS score must be between 0 and 10');
      }

      const response = await fetch(`${backendUrl()}/nps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(npsData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error: ${response.status}`);
      }

      toast.success('Thank you for your feedback!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit NPS feedback';
      setError(errorMessage);
      console.error('Error creating NPS entry:', err);
      toast.error(errorMessage);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const getNPSCategory = (score: number): 'promoter' | 'passive' | 'detractor' => {
    if (score >= 9) return 'promoter';
    if (score >= 7) return 'passive';
    return 'detractor';
  };

  const calculateNPSScore = (): number | null => {
    if (npsInfo.entries.length === 0) return null;

    const promoters = npsInfo.entries.filter((entry) => entry.score >= 9).length;
    const detractors = npsInfo.entries.filter((entry) => entry.score <= 6).length;
    const total = npsInfo.entries.length;

    return Math.round(((promoters - detractors) / total) * 100);
  };

  const getEntriesByEventType = (eventType: NPSEventType): NPSEntry[] => {
    return npsInfo.entries.filter((entry) => entry.eventType === eventType);
  };

  const resetNPSInfo = () => {
    setNPSInfo({
      entries: [],
      currentEntry: null,
      totalCount: 0,
      averageScore: null
    });
  };

  // Transform the NPS entry data to match the expected format
  const transformNPSEntry = (entry: any): NPSEntry => {
    return {
      id: entry.id,
      score: entry.score,
      comment: entry.comment,
      userEmail: entry.userEmail,
      eventType: entry.eventType as NPSEventType,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      userId: entry.userId
    };
  };

  return {
    npsInfo,
    setNPSInfo,
    resetNPSInfo,
    loading,
    submitting,
    error,
    fetchNPSEntries,
    createNPSEntry,
    getNPSCategory,
    calculateNPSScore,
    getEntriesByEventType
  };
}
