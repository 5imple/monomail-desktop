import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';

// Status types
export type ServiceStatus = 'operational' | 'degraded' | 'outage';
export type ServiceType = 'gmail' | 'gcp' | 'server';

interface ServiceStatusState {
  status: ServiceStatus;
  lastChecked: number;
  message?: string;
}

interface StatusState {
  gmail: ServiceStatusState;
  gcp: ServiceStatusState;
  server: ServiceStatusState;
}

interface GCPLocation {
  title: string;
  id: string;
}

interface GCPProduct {
  title: string;
  id: string;
}

interface GCPUpdate {
  created: string;
  modified: string;
  when: string;
  text: string;
  status: string;
  affected_locations: GCPLocation[];
}

interface GCPIncident {
  id: string;
  number: string;
  begin: string;
  created: string;
  end: string | null;
  modified: string;
  external_desc: string;
  updates: GCPUpdate[];
  most_recent_update: GCPUpdate;
  status_impact: string;
  severity: 'low' | 'medium' | 'high';
  service_key: string;
  service_name: string;
  affected_products: GCPProduct[];
  uri: string;
  currently_affected_locations: GCPLocation[];
  previously_affected_locations: GCPLocation[];
}

interface ServiceHealth {
  status: ServiceStatus;
  lastIncident: GCPIncident | null;
  message?: string;
  severity?: 'low' | 'medium' | 'high';
  affectedLocations?: string[];
}

interface GCPHealthState {
  cloudRun: ServiceHealth;
  cloudStorage: ServiceHealth;
  firebaseAuth: ServiceHealth;
  computeEngine: ServiceHealth;
  lastChecked: number;
}

// Initial state
const initialStatusState: StatusState = {
  gmail: { status: 'operational', lastChecked: Date.now() },
  gcp: { status: 'operational', lastChecked: Date.now() },
  server: { status: 'operational', lastChecked: Date.now() }
};

// Atoms for status state
export const statusStateAtom = atom<StatusState>(initialStatusState);

// Status check intervals (in milliseconds)
const CHECK_INTERVALS = {
  gmail: 5 * 60 * 1000, // 5 minutes
  gcp: 15 * 60 * 1000, // 15 minutes
  server: 1 * 60 * 1000 // 1 minute
};

const initialGCPHealthState: GCPHealthState = {
  cloudRun: { status: 'operational', lastIncident: null },
  cloudStorage: { status: 'operational', lastIncident: null },
  firebaseAuth: { status: 'operational', lastIncident: null },
  computeEngine: { status: 'operational', lastIncident: null },
  lastChecked: Date.now()
};

export const gcpHealthStateAtom = atom<GCPHealthState>(initialGCPHealthState);

export const useStatusCheck = () => {
  const [statusState, setStatusState] = useAtom(statusStateAtom);
  const { t } = useTranslation();
  const { accounts } = useAuth();

  const checkGCPStatus = async () => {
    // Check GCP status page
    const response = await fetch('https://status.cloud.google.com/incidents.json');
    if (!response.ok) {
      throw new Error('GCP status check failed');
    }

    const incidents: GCPIncident[] = await response.json();

    const now = Date.now();

    // Process incidents for each service
    const processServiceIncidents = (serviceName: string): ServiceHealth => {
      const serviceIncidents = incidents.filter((incident) => {
        const isActive =
          incident.status_impact === 'SERVICE_OUTAGE' ||
          incident.status_impact === 'SERVICE_DISRUPTION';
        const isRelevant = incident.affected_products.some((product) =>
          product.title.toLowerCase().includes(serviceName.toLowerCase())
        );
        const isCurrent =
          new Date(incident.begin).getTime() <= now &&
          (!incident.end || new Date(incident.end).getTime() >= now);

        return isActive && isRelevant && isCurrent;
      });

      console.log(`Service ${serviceName} incidents:`, serviceIncidents.length);
      if (serviceIncidents.length > 0) {
        console.log(`${serviceName} status:`, serviceIncidents[0].external_desc);
      }

      if (serviceIncidents.length === 0) {
        return { status: 'operational', lastIncident: null };
      }

      // Sort by most recent
      const latestIncident = serviceIncidents.sort(
        (a, b) => new Date(b.begin).getTime() - new Date(a.begin).getTime()
      )[0];

      const affectedLocations = [
        ...latestIncident.currently_affected_locations,
        ...latestIncident.previously_affected_locations
      ].map((loc) => loc.title);

      return {
        status: 'degraded',
        lastIncident: latestIncident,
        message: latestIncident.external_desc,
        severity: latestIncident.severity,
        affectedLocations
      };
    };

    const newHealthState: GCPHealthState = {
      cloudRun: processServiceIncidents('Cloud Run'),
      cloudStorage: processServiceIncidents('Cloud Storage for Firebase'),
      firebaseAuth: processServiceIncidents('Firebase Authentication'),
      computeEngine: processServiceIncidents('Compute Engine'),
      lastChecked: now
    };

    // console.log('New health state:', newHealthState);
    // console.log(
    //   'Services with issues:',
    //   Object.entries(newHealthState)
    //     .filter(([_, service]) => service.status === 'degraded')
    //     .map(([name, service]) => `${name}: ${service.message}`)
    //     .join('\n')
    // );

    setStatusState((prev) => ({
      ...prev,
      gcp: {
        status: Object.values(newHealthState).some((service) => service.status === 'degraded')
          ? 'degraded'
          : 'operational',
        lastChecked: now,
        message: [
          ...new Set(
            Object.values(newHealthState)
              .filter((service) => service.status === 'degraded')
              .map((service) => service.message)
              .filter(Boolean)
          )
        ].join('; ')
      }
    }));
  };

  useEffect(() => {
    // Initial checks
    checkGCPStatus();
    // Set up intervals
    const gcpInterval = setInterval(checkGCPStatus, CHECK_INTERVALS.gcp);

    return () => {
      clearInterval(gcpInterval);
    };
  }, [accounts]); // Re-run when accounts change

  return statusState;
};
