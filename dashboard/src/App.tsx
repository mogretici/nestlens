import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import PageLoader from './components/PageLoader';

// Lazy load all pages for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const RequestsPage = lazy(() => import('./pages/RequestsPage'));
const QueriesPage = lazy(() => import('./pages/QueriesPage'));
const ExceptionsPage = lazy(() => import('./pages/ExceptionsPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const CachePage = lazy(() => import('./pages/CachePage'));
const MailPage = lazy(() => import('./pages/MailPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const HttpClientPage = lazy(() => import('./pages/HttpClientPage'));
const RedisPage = lazy(() => import('./pages/RedisPage'));
const ModelsPage = lazy(() => import('./pages/ModelsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ViewsPage = lazy(() => import('./pages/ViewsPage'));
const CommandsPage = lazy(() => import('./pages/CommandsPage'));
const GatesPage = lazy(() => import('./pages/GatesPage'));
const BatchesPage = lazy(() => import('./pages/BatchesPage'));
const DumpsPage = lazy(() => import('./pages/DumpsPage'));
const EntryDetailPage = lazy(() => import('./pages/EntryDetailPage'));

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="requests"
          element={
            <Suspense fallback={<PageLoader />}>
              <RequestsPage />
            </Suspense>
          }
        />
        <Route
          path="queries"
          element={
            <Suspense fallback={<PageLoader />}>
              <QueriesPage />
            </Suspense>
          }
        />
        <Route
          path="exceptions"
          element={
            <Suspense fallback={<PageLoader />}>
              <ExceptionsPage />
            </Suspense>
          }
        />
        <Route
          path="logs"
          element={
            <Suspense fallback={<PageLoader />}>
              <LogsPage />
            </Suspense>
          }
        />
        <Route
          path="events"
          element={
            <Suspense fallback={<PageLoader />}>
              <EventsPage />
            </Suspense>
          }
        />
        <Route
          path="jobs"
          element={
            <Suspense fallback={<PageLoader />}>
              <JobsPage />
            </Suspense>
          }
        />
        <Route
          path="cache"
          element={
            <Suspense fallback={<PageLoader />}>
              <CachePage />
            </Suspense>
          }
        />
        <Route
          path="mail"
          element={
            <Suspense fallback={<PageLoader />}>
              <MailPage />
            </Suspense>
          }
        />
        <Route
          path="schedule"
          element={
            <Suspense fallback={<PageLoader />}>
              <SchedulePage />
            </Suspense>
          }
        />
        <Route
          path="http-client"
          element={
            <Suspense fallback={<PageLoader />}>
              <HttpClientPage />
            </Suspense>
          }
        />
        <Route
          path="redis"
          element={
            <Suspense fallback={<PageLoader />}>
              <RedisPage />
            </Suspense>
          }
        />
        <Route
          path="models"
          element={
            <Suspense fallback={<PageLoader />}>
              <ModelsPage />
            </Suspense>
          }
        />
        <Route
          path="notifications"
          element={
            <Suspense fallback={<PageLoader />}>
              <NotificationsPage />
            </Suspense>
          }
        />
        <Route
          path="views"
          element={
            <Suspense fallback={<PageLoader />}>
              <ViewsPage />
            </Suspense>
          }
        />
        <Route
          path="commands"
          element={
            <Suspense fallback={<PageLoader />}>
              <CommandsPage />
            </Suspense>
          }
        />
        <Route
          path="gates"
          element={
            <Suspense fallback={<PageLoader />}>
              <GatesPage />
            </Suspense>
          }
        />
        <Route
          path="batches"
          element={
            <Suspense fallback={<PageLoader />}>
              <BatchesPage />
            </Suspense>
          }
        />
        <Route
          path="dumps"
          element={
            <Suspense fallback={<PageLoader />}>
              <DumpsPage />
            </Suspense>
          }
        />
        {/* Type-specific detail routes */}
        <Route
          path="requests/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="queries/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="exceptions/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="logs/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="events/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="jobs/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="cache/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="mail/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="schedule/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="http-client/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="redis/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="models/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="notifications/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="views/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="commands/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="gates/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="batches/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route
          path="dumps/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        {/* Legacy route for backward compatibility */}
        <Route
          path="entries/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EntryDetailPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
