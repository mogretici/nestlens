import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StatsProvider } from './contexts/StatsContext';
import './index.css';

// Get base path from current URL (handles /nestlens prefix)
const getBasePath = () => {
  const path = window.location.pathname;
  const nestlensIndex = path.indexOf('/nestlens');
  if (nestlensIndex !== -1) {
    return path.substring(0, nestlensIndex + '/nestlens'.length);
  }
  return '/nestlens';
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={getBasePath()}>
        <StatsProvider>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#1f2937',
                color: '#f3f4f6',
                borderRadius: '0.5rem',
              },
              success: {
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#f3f4f6',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#f3f4f6',
                },
              },
            }}
          />
        </StatsProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
