"use client";

import { Button } from "@/components/ui/Button";
import { launch } from "../launch";

export function LaunchButton() {
  return (
    <Button variant="red" size="sm" onClick={launch}>
      Launch <span aria-hidden="true">&uarr;</span>
    </Button>
  );
}
