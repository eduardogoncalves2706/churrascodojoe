import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthGate } from './auth';
import './index.css';

// Retry generoso: internet instável e "acordar" do banco (Aurora auto-pause).
const qc = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 8000), staleTime: 15_000 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <AuthGate><BrowserRouter><App /></BrowserRouter></AuthGate>
    </QueryClientProvider>
  </React.StrictMode>,
);
