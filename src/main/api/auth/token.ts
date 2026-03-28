import { apiClient } from '@/main/api/apiClient';

export const verifyToken = async () => {
  const response = await apiClient.get('/auth/verify-token', {
    headers: {
      'Content-Type': 'application/json'
      // Authorization: `Bearer ${token}`
    },
    mode: 'cors'
  });

  return response;
};
