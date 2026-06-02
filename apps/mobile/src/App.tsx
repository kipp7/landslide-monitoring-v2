import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";

const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage }))
);
const SpacePage = lazy(() =>
  import("./pages/SpacePage").then((module) => ({ default: module.SpacePage }))
);
const SpaceModelPage = lazy(() =>
  import("./pages/SpaceModelPage").then((module) => ({ default: module.SpaceModelPage }))
);
const EventsPage = lazy(() =>
  import("./pages/EventsPage").then((module) => ({ default: module.EventsPage }))
);
const EventDetailPage = lazy(() =>
  import("./pages/EventDetailPage").then((module) => ({ default: module.EventDetailPage }))
);
const TasksPage = lazy(() =>
  import("./pages/TasksPage").then((module) => ({ default: module.TasksPage }))
);
const TaskDetailPage = lazy(() =>
  import("./pages/TaskDetailPage").then((module) => ({ default: module.TaskDetailPage }))
);
const AssetsPage = lazy(() =>
  import("./pages/AssetsPage").then((module) => ({ default: module.AssetsPage }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((module) => ({ default: module.ProfilePage }))
);
const StateGalleryPage = lazy(() =>
  import("./pages/StateGalleryPage").then((module) => ({ default: module.StateGalleryPage }))
);

function RouteFallback() {
  return (
    <div className="page-loading-shell" role="status" aria-live="polite">
      <span className="page-loading-shell__badge">Loading Route</span>
      <strong>正在载入空间指挥界面…</strong>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate replace to="/login" />} />
        <Route element={<AppShell />}>
          <Route path="/space" element={<SpacePage />} />
          <Route path="/space/model" element={<SpaceModelPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/me/states" element={<StateGalleryPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
