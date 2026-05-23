import { apiClient } from '@/main/api/apiClient';
import { localDataStore } from '@/renderer/app/lib/localDataStore';
import { IMonoSignature } from '@/renderer/app/store/compose/useSignatureAtom';

const LS_KEY = 'signatures';

const getSignatures = async (): Promise<IMonoSignature[]> => {
  try {
    const result = await apiClient.get<IMonoSignature[]>(`/mono/signature`);
    const list = Array.isArray(result) ? result : [];
    localDataStore.set(LS_KEY, list);
    return list;
  } catch {
    return localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  }
};

const addSignature = async (signature: IMonoSignature): Promise<void> => {
  const current = localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, [...current, signature]);
  apiClient.post(`/mono/signature`, signature).catch(() => {});
};

const updateSignature = async (signature: IMonoSignature): Promise<void> => {
  const current = localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, current.map((s) => (s.id === signature.id ? signature : s)));
  apiClient.put(`/mono/signature/${signature.id}`, signature).catch(() => {});
};

const deleteSignature = async (signatureId: string): Promise<void> => {
  const current = localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, current.filter((s) => s.id !== signatureId));
  apiClient.delete(`/mono/signature/${signatureId}`, {}).catch(() => {});
};

export default {
  getSignatures,
  addSignature,
  updateSignature,
  deleteSignature
};
