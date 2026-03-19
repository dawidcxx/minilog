import { AuthForm } from "../components/AuthForm";
import { SkeletonLayout } from "../components/layouts/SkeletonLayout";
import type { User } from "../types";

type RegisterRouteProps = {
  onDone: (user: User) => void;
  bootError?: string | null;
};

export function RegisterRoute(props: RegisterRouteProps) {
  return (
    <SkeletonLayout>
      {props.bootError && <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">{props.bootError}</p>}
      <AuthForm mode="register" onDone={props.onDone} />
    </SkeletonLayout>
  );
}
