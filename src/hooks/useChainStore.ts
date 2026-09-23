import { useSyncExternalStore } from "react";
import { chainStore } from "../storage/chainStore";
import type { ChainStoreData } from "../rules/chainRules";

export function useChainStore(): ChainStoreData {
  return useSyncExternalStore(chainStore.subscribe, chainStore.getState, chainStore.getState);
}
