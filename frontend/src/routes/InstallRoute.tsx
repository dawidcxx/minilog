import { RegisterRoute } from "./RegisterRoute";
import type { User } from "../types";

type InstallRouteProps = {
  onDone: (user: User) => void;
  bootError?: string | null;
};

export function InstallRoute(props: InstallRouteProps) {
  return <RegisterRoute onDone={props.onDone} bootError={props.bootError} />;
}
