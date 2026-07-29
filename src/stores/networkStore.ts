import { create } from "zustand";
import NetInfo from "@react-native-community/netinfo";
import { flushProgress } from "@/services/progressRepo";

export const useNetwork = create<{ online: boolean; init: () => void }>((set, get) => ({
  online: true,
  init: () => {
    NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      const wasOffline = !get().online;
      set({ online });
      if (online && wasOffline) flushProgress().catch(() => {});
    });
  },
}));
