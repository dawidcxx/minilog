import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ReactNode } from "react";
import type { User } from "../types";

type AppStateContextValue = {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider(props: { value: AppStateContextValue; children: ReactNode }) {
  return <AppStateContext.Provider value={props.value}>{props.children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}
