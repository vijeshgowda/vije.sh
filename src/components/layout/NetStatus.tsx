"use client";

import { useEffect } from "react";
import { uart } from "@/lib/uart";
import { toast } from "./toast";

/** Marks <html data-offline> while the browser is offline (the header LED goes grey) and says so. */
export function NetStatus() {
  useEffect(() => {
    const root = document.documentElement;
    const mark = (offline: boolean) => {
      if (offline) root.dataset.offline = "";
      else delete root.dataset.offline;
    };
    const down = () => {
      mark(true);
      uart("net: link down");
      toast("Offline. Feeds show their last cached data.");
    };
    const up = () => {
      mark(false);
      uart("net: link up");
      toast("Back online.");
    };
    mark(!navigator.onLine);
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
    };
  }, []);
  return null;
}
