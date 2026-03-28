import ai from '@/main/api/ai';
import filter from '@/main/api/ai/filters';
import settings from '@/main/api/ai/settings';
export default {
  ...ai,
  ...filter,
  ...settings
};
