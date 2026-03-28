import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { useState, useEffect } from 'react';

function useWindowFocus() {
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    if (isElectron) {
      const handlefocus = () => {
        setIsFocused(true);
      };
      const handleBlur = () => {
        setIsFocused(false);
      };

      const removefocusListener = electronApi.on('renderer:native:focus', handlefocus);
      const removeBlurListener = electronApi.on('renderer:native:blur', handleBlur);
      return () => {
        removefocusListener();
        removeBlurListener();
      };
    }
    return;
  }, []);

  return { isWindowFocused: isFocused };
}

export default useWindowFocus;
