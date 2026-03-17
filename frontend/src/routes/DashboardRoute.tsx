import { Dashboard } from "../components/Dashboard";

export function DashboardRoute(props: { onLogout: () => Promise<void> }) {
  return <Dashboard onLogout={props.onLogout} />;
}
