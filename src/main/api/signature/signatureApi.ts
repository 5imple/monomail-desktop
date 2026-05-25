import { localDataStore } from '@/renderer/app/lib/localDataStore';
import { IMonoSignature } from '@/renderer/app/store/compose/useSignatureAtom';

// Standalone: signatures live entirely in local storage (no backend).
const LS_KEY = 'signatures';

const getSignatures = async (): Promise<IMonoSignature[]> => {
  return localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
};

const addSignature = async (signature: IMonoSignature): Promise<void> => {
  const current = localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, [...current, signature]);
};

const updateSignature = async (signature: IMonoSignature): Promise<void> => {
  const current = localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  localDataStore.set(
    LS_KEY,
    current.map((s) => (s.id === signature.id ? signature : s))
  );
};

const deleteSignature = async (signatureId: string): Promise<void> => {
  const current = localDataStore.get<IMonoSignature[]>(LS_KEY) ?? [];
  localDataStore.set(
    LS_KEY,
    current.filter((s) => s.id !== signatureId)
  );
};

export default {
  getSignatures,
  addSignature,
  updateSignature,
  deleteSignature
};
