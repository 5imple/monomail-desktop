import signatureApi from '@/main/api/signature/signatureApi';
import { atom, useAtom } from 'jotai';

export interface IMonoSignature {
  id: string;
  name: string;
  content: string;
  icon: string;
  defaultAccountUids: string[];
}

export const signaturesAtom = atom<IMonoSignature[]>([]);

export function useSignatureAtom() {
  const [signatures, setSignatures] = useAtom(signaturesAtom);

  /**
   * Update a signature by its ID with partial data
   */
  const updateSignatureById = (id: string, updatedFields: Partial<IMonoSignature>) => {
    setSignatures((prevSignatures) =>
      prevSignatures.map((signature) =>
        signature.id === id ? { ...signature, ...updatedFields } : signature
      )
    );
  };

  /**
   * Remove a signature by its ID
   */
  const removeSignatureById = (id: string) => {
    setSignatures((prevSignatures) => prevSignatures.filter((signature) => signature.id !== id));
  };

  /**
   * Get a signature by its ID
   */
  const getSignatureById = (id: string) => {
    return signatures.find((signature) => signature.id === id);
  };

  /**
   * Add a new signature to the collection
   */
  const addSignature = (newSignature: IMonoSignature) => {
    setSignatures((prevSignatures) => [newSignature, ...prevSignatures]);
  };

  /**
   * Get the default signature for a specific account
   */
  const getDefaultSignature = (accountUid: string) => {
    return signatures.find((signature) => signature.defaultAccountUids.includes(accountUid));
  };

  /**
   * Set a signature as default for a specific account
   * (and unset any other signatures that were default for this account)
   */
  const setDefaultSignature = (signatureId: string, accountUid: string) => {
    setSignatures((prevSignatures) => {
      // Update all signatures: remove this account from all signatures' defaultAccountUids arrays
      // Then add it only to the target signature's defaultAccountUids
      return prevSignatures.map((signature) => {
        if (signature.id === signatureId) {
          // Add this account to defaultAccountUids if not already there
          const updatedUids = signature.defaultAccountUids.includes(accountUid)
            ? signature.defaultAccountUids
            : [...signature.defaultAccountUids, accountUid];

          return { ...signature, defaultAccountUids: updatedUids };
        } else {
          // Remove this account from defaultAccountUids if it's there
          const updatedUids = signature.defaultAccountUids.filter((uid) => uid !== accountUid);
          return { ...signature, defaultAccountUids: updatedUids };
        }
      });
    });
  };

  /**
   * Check if a signature is the default for a specific account
   */
  const isDefaultForAccount = (signatureId: string, accountUid: string) => {
    const signature = signatures.find((s) => s.id === signatureId);
    return signature ? signature.defaultAccountUids.includes(accountUid) : false;
  };

  return {
    signatures,
    setSignatures,
    getSignatureById,
    updateSignatureById,
    removeSignatureById,
    addSignature,
    getDefaultSignature,
    setDefaultSignature,
    isDefaultForAccount
  };
}
