// src/components/RouteLogger.tsx
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface RouteLoggerProps {
  children: React.ReactNode;
}

const RouteLogger: React.FC<RouteLoggerProps> = ({ children }) => {
  const location = useLocation();

  useEffect(() => {
    console.log('Navigated to:', location.pathname);
  }, [location]);

  return children;
};

export default RouteLogger;
