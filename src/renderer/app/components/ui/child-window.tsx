import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

type ChildWindowProps = {
  children: React.ReactNode;
  options?: Partial<Electron.BrowserWindowConstructorOptions>;
  onClosed?: () => void;
};

export function ChildWindow({ children, options = {}, onClosed }: ChildWindowProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const childWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    // Open the new window
    const config = JSON.stringify({ options, windowId: 'this-is-id' });

    // Open the new window with encoded config
    const childWindow = window.open(`about:blank`, '_blank', `config=${config}`);
    if (!childWindow) {
      console.error('Failed to open new window');
      return;
    }
    // Store reference to the window
    childWindowRef.current = childWindow;

    // Create a container for React rendering
    setContainer(childWindow.document.body);

    // Handle window close
    const handleUnload = () => {
      if (onClosed) onClosed();
      setContainer(null);
    };

    childWindow.addEventListener('unload', handleUnload);

    return () => {
      childWindow.removeEventListener('unload', handleUnload);
      childWindow.close();
    };
  }, [onClosed, options]);

  // Render children in the new window's container
  return container ? ReactDOM.createPortal(children, container) : null;
}
