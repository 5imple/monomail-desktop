export const isDevelopment = () => {
  return import.meta.env.DEV || import.meta.env.MONO_ENV_APP_VERSION.includes('dev');
};
