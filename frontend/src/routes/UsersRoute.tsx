import { UsersManagement } from "../components/UsersManagement";
import { AppNavigation } from "../components/AppNavigation";
import { DashboardLayout } from "../components/layouts/DashboardLayout";
import type { User } from "../types";

export function UsersRoute(props: { user: User; onLogout: () => Promise<void> }) {
  return (
    <DashboardLayout navigation={<AppNavigation user={props.user} onLogout={props.onLogout} />}>
      <UsersManagement />
    </DashboardLayout>
  );
}
