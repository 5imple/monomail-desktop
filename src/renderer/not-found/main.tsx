import { ThemeProvider } from '@/renderer/app/components/ThemeProvider';
import NotFoundLayout from '@/renderer/app/containers/layout/NotFoundLayout';
import ReactDOM from 'react-dom/client';
import '@/renderer/global.css';
import './global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider defaultTheme={'light'} storageKey="ui-theme">
    <NotFoundLayout />
  </ThemeProvider>
);
