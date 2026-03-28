import { TrackingHistory } from '@/main/api/tracking/types';
import { atom } from 'jotai';

export const trackingHistoriesAtom = atom<Record<string, Record<string, TrackingHistory[]>>>({});
