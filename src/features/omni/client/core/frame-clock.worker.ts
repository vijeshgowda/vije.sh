// A page's own timers and requestAnimationFrame stall in a hidden tab; a worker's timers keep
// ticking, so the recording keeps getting frames while the call is in the background.
setInterval(() => self.postMessage(0), 33);
