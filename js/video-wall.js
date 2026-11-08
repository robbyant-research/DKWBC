(() => {
  'use strict';

  const videoDialog = document.getElementById('video-dialog');
  const dialogVideo = document.getElementById('dialog-video');
  const videoWall = document.getElementById('video-wall');
  const wallStage = videoWall.querySelector('.wall-stage');
  const wallGrid = videoWall.querySelector('.wall-grid');
  const featuredTile = videoWall.querySelector('.featured-tile');
  const featuredVideo = document.getElementById('wall-feature-video');
  const wallVideos = [...videoWall.querySelectorAll('video')];
  const mediaUrlPromises = new Map();
  window.DKWBCMedia = {
    cachedURL(url) {
      const key = new URL(url, document.baseURI).href;
      if (window.origin === 'null') return Promise.resolve(key);
      if (!mediaUrlPromises.has(key))
        mediaUrlPromises.set(
          key,
          (async () => {
            let cache;
            try {
              if (window.isSecureContext && window.caches)
                cache = await caches.open('dkwbc-page-media-v1');
            } catch {}
            let response = await cache?.match(key);
            if (!response) {
              response = await fetch(key, {
                cache: 'force-cache',
                signal: AbortSignal.timeout(45000),
              });
              if (!response.ok) throw new Error(`Media HTTP ${response.status}`);
              try {
                await cache?.put(key, response.clone());
              } catch {}
            }
            return URL.createObjectURL(await response.blob());
          })().catch((error) => {
            mediaUrlPromises.delete(key);
            throw error;
          }),
        );
      return mediaUrlPromises.get(key);
    },
  };
  let wallVideosReady = false,
    wallVideosLoading = false,
    wallPlaybackStarted = false,
    wallPlaybackSeconds = 0,
    lastWallTimestamp = 0;
  const wallStatus = document.createElement('button');
  wallStatus.type = 'button';
  wallStatus.className = 'wall-load-status';
  wallStatus.textContent = 'Loading videos…';
  wallStatus.disabled = true;
  videoWall.querySelector('.wall-heading').after(wallStatus);
  wallStatus.addEventListener('click', () =>
    wallVideosReady ? syncWallPlayback() : prepareWall(),
  );
  wallVideos.forEach((video) => {
    video.muted = true;
    video.loop = true;
    video.autoplay = false;
  });
  async function loadWallVideo(video) {
    if (video.dataset.cached) return;
    const source = video.querySelector('source');
    const url = await window.DKWBCMedia.cachedURL(source.dataset.src);
    await new Promise((resolve, reject) => {
      if (window.origin === 'null') video.onloadedmetadata = resolve;
      else video.onloadeddata = resolve;
      video.onerror = reject;
      video.src = url;
      video.load();
    });
    video.dataset.cached = 'true';
  }
  async function prepareWall() {
    if (wallVideosLoading || wallVideosReady) return;
    wallVideosLoading = true;
    wallStatus.hidden = false;
    wallStatus.disabled = true;
    wallStatus.textContent = 'Loading videos…';
    try {
      await loadWallVideo(featuredVideo);
      syncWallPlayback();
      const pending = wallVideos.filter((video) => video !== featuredVideo);
      async function worker() {
        while (pending.length) await loadWallVideo(pending.shift());
      }
      const results = await Promise.allSettled(
        Array.from(
          {
            length: 3,
          },
          worker,
        ),
      );
      if (results.some((result) => result.status === 'rejected'))
        throw new Error('Video load failed');
      wallVideosReady = true;
      wallStatus.hidden = true;
      syncWallPlayback();
    } catch {
      wallStatus.textContent = 'Videos could not load. Click to retry.';
      wallStatus.disabled = false;
    } finally {
      wallVideosLoading = false;
    }
  }
  function syncWallPlayback() {
    const visible = wallVisible && !document.hidden && !videoDialog.open && !reducedMotion.matches;
    const groupActive = visible && wallPhase !== 'intro' && wallVideosReady;
    if (groupActive && !wallPlaybackStarted) {
      wallPlaybackStarted = true;
      wallPlaybackSeconds = 0;
      wallVideos.forEach((video) => (video.currentTime = 0));
    }
    lastWallTimestamp = 0;
    wallVideos.forEach((video) => {
      const active =
        visible &&
        (wallPhase === 'intro' ? video === featuredVideo && video.dataset.cached : wallVideosReady);
      if (active) video.play().catch(() => {});
      else video.pause();
    });
  }
  function tickWall(now) {
    if (
      wallPlaybackStarted &&
      wallVideosReady &&
      wallVisible &&
      !document.hidden &&
      !videoDialog.open &&
      wallPhase !== 'intro' &&
      !reducedMotion.matches
    ) {
      if (lastWallTimestamp) wallPlaybackSeconds += (now - lastWallTimestamp) / 1000;
      lastWallTimestamp = now;
      for (const video of wallVideos) {
        if (!Number.isFinite(video.duration) || video.seeking) continue;
        const target = wallPlaybackSeconds % video.duration,
          delta = Math.abs(target - video.currentTime);
        if (Math.min(delta, video.duration - delta) > 0.12) video.currentTime = target;
      }
    } else lastWallTimestamp = 0;
    requestAnimationFrame(tickWall);
  }
  requestAnimationFrame(tickWall);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let dialogOpener,
    wallPhase = 'grid',
    introAnimation,
    introFallbackTimer,
    wallVisible = false;
  function introTransform() {
    return `translate(${-featuredTile.offsetLeft}px, ${-featuredTile.offsetTop}px) scale(${wallStage.clientWidth / featuredTile.offsetWidth})`;
  }
  function sizeStage() {
    const [mediaWidth, mediaHeight = 1] = getComputedStyle(featuredVideo.closest('.wall-media'))
      .aspectRatio.split('/')
      .map(Number);
    const mediaAspect = mediaWidth > 0 && mediaHeight > 0 ? mediaWidth / mediaHeight : 16 / 9;
    wallStage.style.height = `${wallPhase === 'intro' ? wallStage.clientWidth / mediaAspect : wallGrid.offsetHeight}px`;
    if (wallPhase === 'intro') featuredTile.style.transform = introTransform();
  }
  function showGrid(animate = true) {
    if (wallPhase !== 'intro') return;
    clearTimeout(introFallbackTimer);
    const initialTransform = introTransform();
    wallPhase = 'revealing';
    featuredTile.style.transform = '';
    videoWall.classList.remove('wall-intro');
    videoWall.classList.add('wall-revealing');
    sizeStage();
    const finish = () => {
      wallPhase = 'grid';
      introAnimation = null;
      videoWall.classList.remove('wall-revealing');
      sizeStage();
      syncWallPlayback();
    };
    if (animate && !reducedMotion.matches) {
      introAnimation = featuredTile.animate(
        [
          {
            transform: initialTransform,
          },
          {
            transform: 'translate(0, 0) scale(1)',
          },
        ],
        {
          duration: 1400,
          easing: 'cubic-bezier(.22,1,.36,1)',
          fill: 'none',
        },
      );
      introAnimation.onfinish = finish;
    } else finish();
  }
  function startIntro() {
    introAnimation?.cancel();
    introAnimation = null;
    clearTimeout(introFallbackTimer);
    if (reducedMotion.matches) {
      wallPhase = 'grid';
      sizeStage();
      return;
    }
    wallPhase = 'intro';
    videoWall.classList.remove('wall-revealing');
    videoWall.classList.add('wall-intro');
    featuredVideo.currentTime = 0;
    sizeStage();
    wallVideos.forEach((video) => {
      if (video !== featuredVideo) video.pause();
    });
    syncWallPlayback();
    introFallbackTimer = setTimeout(() => showGrid(), 8000);
  }
  featuredVideo.addEventListener('timeupdate', () => {
    if (wallPhase === 'intro' && featuredVideo.currentTime >= 3.5) showGrid();
  });
  featuredVideo.addEventListener('error', () => showGrid(false));
  let previousWidth = 0;
  new ResizeObserver(() => {
    const width = videoWall.clientWidth;
    if (width === previousWidth) return;
    previousWidth = width;
    if (wallPhase === 'revealing') introAnimation?.finish();
    sizeStage();
  }).observe(videoWall);
  new IntersectionObserver(
    (entries) => {
      wallVisible = entries[0].isIntersecting;
      if (wallVisible) prepareWall();
      if (!wallVisible && wallPhase === 'intro') showGrid(false);
      syncWallPlayback();
    },
    {
      threshold: 0,
    },
  ).observe(videoWall);
  function pauseAllExcept(active) {
    document.querySelectorAll('video').forEach((video) => {
      if (video !== active) video.pause();
    });
  }
  document.querySelectorAll('.wall-tile, [data-video-dialog]').forEach((link) =>
    link.addEventListener('click', (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !videoDialog.showModal
      )
        return;
      event.preventDefault();
      if (wallPhase === 'intro') showGrid(false);
      dialogOpener = link;
      document.getElementById('dialog-title').textContent = link.dataset.title;
      const requestedURL = link.href;
      dialogVideo.dataset.requested = requestedURL;
      window.DKWBCMedia.cachedURL(requestedURL)
        .then((url) => {
          if (videoDialog.open && dialogVideo.dataset.requested === requestedURL) {
            dialogVideo.src = url;
            dialogVideo.play().catch(() => {});
          }
        })
        .catch(() => {
          if (videoDialog.open && dialogVideo.dataset.requested === requestedURL)
            dialogVideo.src = requestedURL;
        });
      dialogVideo.poster =
        link.querySelector('video')?.poster ||
        link.querySelector('img')?.src ||
        featuredVideo.poster;
      videoDialog.showModal();
      document.body.classList.add('dialog-open');
      pauseAllExcept(dialogVideo);
      dialogVideo.play().catch(() => {});
    }),
  );
  document.getElementById('dialog-close').addEventListener('click', () => videoDialog.close());
  videoDialog.addEventListener('click', (event) => {
    const dialogBounds = videoDialog.getBoundingClientRect();
    if (
      event.target === videoDialog &&
      (event.clientX < dialogBounds.left ||
        event.clientX > dialogBounds.right ||
        event.clientY < dialogBounds.top ||
        event.clientY > dialogBounds.bottom)
    )
      videoDialog.close();
  });
  videoDialog.addEventListener('close', () => {
    dialogVideo.dataset.requested = '';
    dialogVideo.pause();
    dialogVideo.removeAttribute('src');
    dialogVideo.load();
    document.body.classList.remove('dialog-open');
    dialogOpener?.focus({
      preventScroll: true,
    });
    syncWallPlayback();
  });
  document.addEventListener(
    'play',
    (event) => {
      if (event.target === dialogVideo) pauseAllExcept(dialogVideo);
    },
    true,
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAllExcept(null);
    else syncWallPlayback();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) showGrid(false);
    syncWallPlayback();
  });
  videoWall.classList.add('wall-enhanced');
  sizeStage();
  if (!reducedMotion.matches) startIntro();
  const navigationLinks = [...document.querySelectorAll('.side-nav a')];
  const sections = navigationLinks.map((link) => document.querySelector(link.getAttribute('href')));
  let navigationFrame;
  function updateNav() {
    let selectedSectionIndex = 0;
    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top <= 160) selectedSectionIndex = index;
    });
    if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 3)
      selectedSectionIndex = sections.length - 1;
    navigationLinks.forEach((link, index) => {
      link.classList.toggle('active', index === selectedSectionIndex);
      if (index === selectedSectionIndex) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    navigationFrame = null;
  }
  window.addEventListener(
    'scroll',
    () => {
      if (!navigationFrame) navigationFrame = requestAnimationFrame(updateNav);
    },
    {
      passive: true,
    },
  );
  window.addEventListener('resize', updateNav);
  updateNav();
})();
