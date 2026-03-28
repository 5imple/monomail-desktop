import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';

const initializeAmplitude = () => {
  // Add the session replay plugin
  amplitude.add(
    sessionReplayPlugin({
      sampleRate: 1 // Capture 100% of sessions
    })
  );

  // Initialize Amplitude with your API key
  amplitude.init('e36a4d80f6bbad334a3ca71f7c13e562', {
    autocapture: {
      elementInteractions: true
    }
  });
};

export default initializeAmplitude;
