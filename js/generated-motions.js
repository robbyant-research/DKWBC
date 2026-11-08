(() => {
  'use strict';

  const gallery = document.getElementById('generated-motions');
  if (!gallery) return;
  const videos = [...gallery.querySelectorAll('video')];
  const dialog = document.getElementById('video-dialog');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const visible = new Set();
  let paused = reducedMotion.matches;

  function syncPlayback() {
    for (const video of videos) {
      const active = visible.has(video) && !paused && !document.hidden && !dialog.open;
      if (active) {
        if (!video.getAttribute('src')) {
          video.src = video.dataset.src;
          video.load();
        }
        video.play().catch(() => {});
      } else video.pause();
    }
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.15) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    syncPlayback();
  }, { threshold: [0, 0.15] });
  videos.forEach((video) => observer.observe(video));

  reducedMotion.addEventListener('change', () => {
    paused = reducedMotion.matches;
    syncPlayback();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  // The shared dialog pauses page videos when opened; resume visible previews on close.
  dialog.addEventListener('close', syncPlayback);
})();
