import { apiClient } from '@/main/api/apiClient';
import { IMonoSignature } from '@/renderer/app/store/compose/useSignatureAtom';

/**
 * Get all signatures
 * @returns {Promise<IAccountSignatures>}
 */
const getSignatures = () => {
  return apiClient.get<IMonoSignature[]>(`/mono/signature`);
};

/**
 * Add a new signature
 * @param {IMonoSignature} signature
 * @returns {Promise<void>}
 */
const addSignature = (signature: IMonoSignature) => {
  return apiClient.post(`/mono/signature`, signature);
};

/**
 * Update an existing signature
 * @param {IMonoSignature} signature
 * @returns {Promise<void>}
 */
const updateSignature = (signature: IMonoSignature) => {
  return apiClient.put(`/mono/signature/${signature.id}`, signature);
};

/**
 * Delete a signature
 * @param {string} signatureId
 * @returns {Promise<void>}
 */
const deleteSignature = (signatureId: string) => {
  return apiClient.delete(`/mono/signature/${signatureId}`, {});
};

export default {
  getSignatures,
  addSignature,
  updateSignature,
  deleteSignature
};
