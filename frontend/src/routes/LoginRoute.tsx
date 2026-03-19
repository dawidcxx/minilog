import { AuthForm } from "../components/AuthForm";
import { SkeletonLayout } from "../components/layouts/SkeletonLayout";
import type { User } from "../types";

export function LoginRoute(props: { onDone: (user: User) => void }) {
  return (
    <SkeletonLayout>
      <AuthForm mode="login" onDone={props.onDone} />
    </SkeletonLayout>
  );
}
