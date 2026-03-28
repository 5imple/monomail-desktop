import '@/renderer/global.css';
import { ThemeProvider } from '@/renderer/app/components/ThemeProvider';
import NotificationContainer from '@/renderer/app/containers/notification/NotificationContainer';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider defaultTheme={'light'} storageKey="ui-theme">
    <BrowserRouter>
      <NotificationContainer />
    </BrowserRouter>
  </ThemeProvider>
);
