import { AuthForm } from "../components/AuthForm";
import type { User } from "../types";

export function LoginRoute(props: { onDone: (user: User) => void }) {
  return <AuthForm mode="login" onDone={props.onDone} />;
}
