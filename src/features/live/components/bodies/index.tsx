"use client";

import type { ComponentType } from "react";
import type { ServerFeedKey } from "../../catalog";
import type { FeedDataMap } from "../../types";
import { Models, Papers } from "./ai";
import { Lifecycle, NpmDownloads, Releases, Stories } from "./dev";
import { Events, Quakes } from "./earth";
import { Advisories, StatusBoard } from "./ops";
import { CrewList, Launches, News, SpaceWeatherChart, XRayChart } from "./space";

/** Body renderer for each server feed. Add a feed: loader + parser, catalog entry, and a body here. */
export const BODIES: { [K in ServerFeedKey]: ComponentType<{ data: FeedDataMap[K] }> } = {
  man: Launches,
  hn: Stories,
  show: Stories,
  crew: CrewList,
  kp: SpaceWeatherChart,
  sfn: News,
  rel: Releases,
  eol: Lifecycle,
  stat: StatusBoard,
  hf: Models,
  pap: Papers,
  npm: NpmDownloads,
  xr: XRayChart,
  eq: Quakes,
  eo: Events,
  sec: Advisories,
};
