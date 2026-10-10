"use client";

import { useEffect, useRef, useState } from "react";
import { useReveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import { uart } from "@/lib/uart";
import s from "./Overview.module.css";

type PodState = "pending" | "run" | "crash" | "term";
interface Pod {
  id: string;
  node: string;
  state: PodState;
}

const NODES = ["node-a", "node-b", "node-c"] as const;
const LABEL: Record<PodState, string> = {
  pending: "Pending",
  run: "Running",
  crash: "CrashLoopBackOff",
  term: "Terminating",
};

/**
 * A self-healing Kubernetes toy: a controller loop reconciles replicas every 320 ms while the
 * cluster is on screen; click a pod to delete it, scale, drain node-b, or let chaos crash one.
 * State lives in a mutable controller (like the real thing); React just renders snapshots.
 */
function createController(render: (pods: Pod[], restarts: number) => void) {
  const pods: Pod[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let restarts = 0;
  let want = 6;
  let drained = false;

  const commit = () =>
    render(
      pods.map((p) => ({ ...p })),
      restarts,
    );
  const later = (f: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      f();
      commit();
    }, ms);
    timers.add(t);
  };
  const alive = () => pods.filter((p) => p.state !== "term");
  const kill = (p: Pod, why: string) => {
    if (p.state === "term") return;
    p.state = "term";
    uart(`k8s: ${p.id} ${why}`);
    later(() => pods.splice(pods.indexOf(p), 1), 500);
  };
  const make = () => {
    const l = alive();
    const node = NODES.filter((n) => !(drained && n === "node-b")).sort(
      (a, b) => l.filter((p) => p.node === a).length - l.filter((p) => p.node === b).length,
    )[0]!;
    const p: Pod = {
      id: `web-${Math.floor(Math.random() * 4096)
        .toString(16)
        .padStart(3, "0")}`,
      node,
      state: "pending",
    };
    pods.push(p);
    uart(`k8s: scheduled ${p.id} on ${node}`);
    later(
      () => {
        if (p.state === "pending") p.state = "run";
      },
      600 + Math.random() * 600,
    );
  };

  return {
    reconcile() {
      alive().forEach((p) => drained && p.node === "node-b" && kill(p, "evicted from node-b"));
      const l = alive();
      if (l.length < want) make();
      else if (l.length > want) kill(l[l.length - 1]!, "scaled down");
      commit();
    },
    crash() {
      const r = alive().filter((p) => p.state === "run");
      const p = r[Math.floor(Math.random() * r.length)];
      if (!p) return;
      p.state = "crash";
      restarts++;
      uart(`k8s: ${p.id} CrashLoopBackOff, restarting`);
      later(() => {
        if (p.state === "crash") p.state = "run";
      }, 1800);
      commit();
    },
    kill(id: string, why: string) {
      const p = pods.find((x) => x.id === id);
      if (p) kill(p, why);
      commit();
    },
    killRandom() {
      const l = alive();
      const p = l[Math.floor(Math.random() * l.length)];
      if (p) kill(p, "killed by chaos monkey");
      commit();
    },
    setWant(w: number) {
      want = w;
      commit();
    },
    setDrained(d: boolean) {
      drained = d;
      commit();
    },
    stop() {
      timers.forEach(clearTimeout);
    },
  };
}

type Controller = ReturnType<typeof createController>;

export function Cluster() {
  const [view, setView] = useState<{ pods: Pod[]; restarts: number }>({ pods: [], restarts: 0 });
  const [want, setWant] = useState(6);
  const [drained, setDrained] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  useReveal(root, { self: true });

  useEffect(() => {
    const c = createController((pods, restarts) => setView({ pods, restarts }));
    ctl.current = c;
    let vis = false;
    const io = new IntersectionObserver((e) => (vis = e[0]?.isIntersecting ?? false), {
      threshold: 0.3,
    });
    if (root.current) io.observe(root.current);
    const loop = setInterval(() => vis && !document.hidden && c.reconcile(), 320);
    const chaos = setInterval(() => vis && !document.hidden && c.crash(), 7000);
    return () => {
      clearInterval(loop);
      clearInterval(chaos);
      io.disconnect();
      c.stop();
      ctl.current = null;
    };
  }, []);

  const scale = (d: number) => {
    const w = Math.max(1, Math.min(12, want + d));
    setWant(w);
    ctl.current?.setWant(w);
    uart(`k8s: scaled vije-web to ${w}`);
  };
  const toggleDrain = () => {
    setDrained(!drained);
    ctl.current?.setDrained(!drained);
    uart(`k8s: node-b ${drained ? "uncordoned" : "cordoned and drained"}`);
  };
  const alive = view.pods.filter((p) => p.state !== "term");

  return (
    <div className={s.k8s} ref={root}>
      <div className={s.kctl}>
        <span>deployment/vije-web</span>
        <div className={s.kscale} role="group" aria-label="Replicas">
          <Button size="sm" aria-label="Scale down" onClick={() => scale(-1)}>
            &minus;
          </Button>
          <output>{want}</output>
          <Button size="sm" aria-label="Scale up" onClick={() => scale(1)}>
            +
          </Button>
        </div>
        <Button size="sm" onClick={() => ctl.current?.killRandom()}>
          Chaos: kill a pod
        </Button>
        <Button size="sm" aria-pressed={drained} onClick={toggleDrain}>
          {drained ? "Uncordon node-b" : "Drain node-b"}
        </Button>
      </div>
      <div className={s.nodes}>
        {NODES.map((n) => {
          const cordon = drained && n === "node-b";
          return (
            <div key={n} className={`${s.node} ${cordon ? s.cordon : ""}`}>
              <header>
                <i className={s.nled} aria-hidden="true" />
                <b>{n}</b>
                <span className={s.nst}>{cordon ? "SchedulingDisabled" : "Ready"}</span>
              </header>
              <div className={s.pods}>
                {view.pods
                  .filter((p) => p.node === n)
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${s.pod} ${s[p.state] ?? ""} probe`}
                      aria-label={`Pod ${p.id} on ${p.node}, ${LABEL[p.state]}. Delete pod.`}
                      onClick={() => ctl.current?.kill(p.id, "deleted by guest")}
                    >
                      {p.id.slice(4)}
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className={s.kst}>
        {alive.filter((p) => p.state === "run").length}/{want} ready &middot;{" "}
        {alive.filter((p) => p.state === "pending").length} pending &middot; restarts{" "}
        {view.restarts} &middot; {drained ? 2 : 3}/3 nodes schedulable
      </p>
    </div>
  );
}
