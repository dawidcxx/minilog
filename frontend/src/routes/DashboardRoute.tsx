import { Dashboard } from "../components/Dashboard";
import { AppNavigation } from "../components/AppNavigation";
import { DashboardLayout } from "../components/layouts/DashboardLayout";
import type { User } from "../types";

export function DashboardRoute(props: { user: User; onLogout: () => Promise<void> }) {
  return (
    <DashboardLayout navigation={<AppNavigation user={props.user} onLogout={props.onLogout} />}>
      <Dashboard onLogout={props.onLogout} />
    </DashboardLayout>
  );
}
