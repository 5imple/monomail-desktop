import { IMonoSignature } from '@/renderer/app/store/compose/useSignatureAtom';

export interface GetSignaturesResponse {
  signatures: Array<IMonoSignature>;
}
