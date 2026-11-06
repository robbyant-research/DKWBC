'use strict';

(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => {
    value = clamp(value);
    return value * value * (3 - 2 * value);
  };
  const mix = (startValue, endValue, fraction) => startValue + (endValue - startValue) * fraction;
  function createStepTimeline(storyFigure, initialStep, renderStep, transitionMilliseconds = 1050) {
    let stepPosition = initialStep,
      targetStep = initialStep,
      animationFrame = 0,
      lastTimestamp = 0;
    function notifyStepChange() {
      storyFigure.setAttribute('aria-busy', storyFigure.dataset.animating);
      storyFigure.dispatchEvent(new Event('storychange'));
    }
    function finishTransition() {
      animationFrame = 0;
      storyFigure.dataset.animating = 'false';
      notifyStepChange();
    }
    function paintCurrentStep() {
      storyFigure.dataset.progress = String(stepPosition);
      renderStep(stepPosition);
    }
    function animateStep(now) {
      const delta = Math.max(0, Math.min((now - lastTimestamp) / transitionMilliseconds, 0.06));
      lastTimestamp = now;
      stepPosition +=
        Math.sign(targetStep - stepPosition) * Math.min(Math.abs(targetStep - stepPosition), delta);
      paintCurrentStep();
      if (stepPosition !== targetStep) animationFrame = requestAnimationFrame(animateStep);
      else finishTransition();
    }
    function setTargetStep(nextStepIndex) {
      targetStep = nextStepIndex;
      storyFigure.dataset.target = String(targetStep);
      storyFigure.dataset.direction = targetStep >= stepPosition ? 'forward' : 'reverse';
      if (reducedMotion.matches) {
        cancelAnimationFrame(animationFrame);
        stepPosition = targetStep;
        paintCurrentStep();
        finishTransition();
        return;
      }
      if (stepPosition !== targetStep && !animationFrame) {
        lastTimestamp = performance.now();
        storyFigure.dataset.animating = 'true';
        notifyStepChange();
        animationFrame = requestAnimationFrame(animateStep);
      } else if (stepPosition === targetStep) {
        cancelAnimationFrame(animationFrame);
        finishTransition();
      }
    }
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) setTargetStep(targetStep);
    });
    document.addEventListener('visibilitychange', () => {
      lastTimestamp = performance.now();
    });
    storyFigure.dataset.animating = 'false';
    paintCurrentStep();
    return setTargetStep;
  }
  const selectElement = (selector) => document.querySelector(selector);
  function setOpacity(selector, opacity) {
    selectElement(selector).style.opacity = clamp(opacity);
    selectElement(selector).style.visibility = opacity <= 0 ? 'hidden' : 'visible';
  }
  function setTransform(selector, positionX, positionY, scale = 1) {
    selectElement(selector).setAttribute(
      'transform',
      `translate(${positionX.toFixed(3)} ${positionY.toFixed(3)}) scale(${scale.toFixed(4)})`,
    );
  }
  const wireCache = new Map(),
    stageCache = new Map();
  let nextWireId = 0;
  function routeWires(selector) {
    if (wireCache.has(selector)) return wireCache.get(selector);
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const wires = [...document.querySelectorAll(selector)].map((path) => {
      const length = path.getTotalLength(),
        box = path.getBBox(),
        svg = path.ownerSVGElement;
      let defs = svg.querySelector(':scope > defs');
      if (!defs) {
        defs = document.createElementNS(svgNamespace, 'defs');
        svg.prepend(defs);
      }
      const mask = document.createElementNS(svgNamespace, 'mask'),
        reveal = document.createElementNS(svgNamespace, 'path');
      mask.id = `wire-reveal-${++nextWireId}`;
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
      for (const [key, value] of Object.entries({
        x: box.x - 12,
        y: box.y - 12,
        width: box.width + 24,
        height: box.height + 24,
      }))
        mask.setAttribute(key, value);
      reveal.setAttribute('d', path.getAttribute('d'));
      Object.assign(reveal.style, {
        fill: 'none',
        stroke: 'white',
        strokeWidth: '12',
        strokeLinecap: 'butt',
        strokeLinejoin: 'round',
        strokeDasharray: `${length} ${length}`,
      });
      mask.append(reveal);
      defs.append(mask);
      path.dataset.wire = 'true';
      return {
        path,
        reveal,
        mask,
        length,
        marker: path.getAttribute('marker-end'),
        progress: null,
      };
    });
    wireCache.set(selector, wires);
    return wires;
  }
  function paintWire(wire, value) {
    const bounded = clamp(value),
      progress = bounded > 1 - 1e-9 ? 1 : bounded < 1e-9 ? 0 : bounded;
    if (progress === wire.progress) return;
    wire.progress = progress;
    wire.path.dataset.drawProgress = progress.toFixed(5);
    wire.path.style.opacity = '1';
    wire.path.style.visibility = progress > 0 ? 'visible' : 'hidden';
    if (progress > 0 && progress < 1) {
      wire.path.setAttribute('mask', `url(#${wire.mask.id})`);
      wire.reveal.style.strokeDashoffset = String(wire.length * (1 - progress));
    } else wire.path.removeAttribute('mask');
    if (wire.marker) wire.path.setAttribute('marker-end', progress === 1 ? wire.marker : 'none');
  }
  function drawWires(selector, progress) {
    routeWires(selector).forEach((wire) => paintWire(wire, progress));
  }
  function drawRoute(selectors, progress) {
    const wires = selectors.flatMap(routeWires),
      length = wires.reduce((totalLength, wire) => totalLength + wire.length, 0);
    const value = clamp(progress);
    if (value === 0 || value === 1) {
      wires.forEach((wire) => paintWire(wire, value));
      return;
    }
    let covered = value * length;
    for (const wire of wires) {
      paintWire(wire, covered / wire.length);
      covered -= wire.length;
    }
  }
  function wireStage(selector, progress) {
    const wireGroup = selectElement(selector),
      value = clamp(progress);
    if (stageCache.get(wireGroup) === value) return;
    stageCache.set(wireGroup, value);
    wireGroup.style.opacity = '1';
    wireGroup.style.visibility = value > 0 ? 'visible' : 'hidden';
    for (const child of wireGroup.children)
      if (child.dataset.wire !== 'true') child.style.opacity = value;
  }
  const motionData = window.DKWBCMotionData;
  if (!motionData) throw new Error('Missing recorded run data');
  const landmarkIndex = Object.fromEntries(
    motionData.landmarkNames.map((landmarkName, index) => [landmarkName, index]),
  );
  const loopStartFrame = 58,
    loopEndFrame = 99,
    loopFrameCount = loopEndFrame - loopStartFrame;
  let motionFrame = loopStartFrame,
    motionPlaying = false,
    playbackAnimationFrame = 0;
  let framesReady = false,
    resumePlaybackWhenVisible = !reducedMotion.matches,
    hasVisibleStory = false;
  function samplePose(stream, frame) {
    const frames = motionData[stream],
      offset = motionData.streamStartFrames?.[stream] || 0;
    const frameIndex = Math.floor(Math.max(0, Math.min(frames.length - 1, frame - offset)));
    const result = frames[frameIndex].map((landmark) => landmark.slice());
    result.stream = stream;
    result.frame = frameIndex + offset;
    return result;
  }
  const projectLandmark = (pose, name) => {
    const landmark = pose[landmarkIndex[name]];
    return [landmark[0] * 125, 60 - landmark[1] * 125];
  };
  function renderRobot(selector, pose, positionX, positionY, scale = 1) {
    const robotGroup = selectElement(selector),
      frame = Math.floor(pose.frame),
      robotImage = robotGroup.querySelector('image');
    robotGroup.dataset.stream = pose.stream;
    robotGroup.dataset.frame = frame.toFixed(3);
    const url = `assets/motion-frames/${pose.stream}/${String(frame).padStart(3, '0')}.webp`;
    if (robotImage.getAttribute('href') !== url) robotImage.setAttribute('href', url);
    setTransform(selector, positionX, positionY, scale);
  }
  function groundAt(selector, pose, positionX, positionY, scale, suspended = false) {
    setTransform(selector, positionX, positionY, scale);
    const footLandmarkNames = ['left_heel', 'left_toe', 'right_heel', 'right_toe'];
    const lowestFootLandmark = footLandmarkNames.reduce((firstLandmark, secondLandmark) =>
      pose[landmarkIndex[firstLandmark]][1] < pose[landmarkIndex[secondLandmark]][1]
        ? firstLandmark
        : secondLandmark,
    );
    const shadow = selectElement(selector + ' .ground-shadow');
    shadow.setAttribute(
      'cx',
      projectLandmark(pose, lowestFootLandmark)[0] * (suspended ? 0.78 : 1),
    );
    shadow.setAttribute('rx', suspended ? 27 : 19);
    shadow.setAttribute('ry', suspended ? 6 : 4.5);
  }
  function forceAt(selector, pose, positionX, positionY, scale, opacity) {
    const footLandmarkNames = ['left_heel', 'left_toe', 'right_heel', 'right_toe'];
    const lowestFootLandmark = footLandmarkNames.reduce((firstLandmark, secondLandmark) =>
        pose[landmarkIndex[firstLandmark]][1] < pose[landmarkIndex[secondLandmark]][1]
          ? firstLandmark
          : secondLandmark,
      ),
      footPosition = projectLandmark(pose, lowestFootLandmark);
    setTransform(
      selector,
      positionX + (footPosition[0] + 16) * scale,
      positionY + (footPosition[1] - 60) * scale,
      scale,
    );
    setOpacity(selector, opacity * (pose[landmarkIndex[lowestFootLandmark]][1] < 0.04 ? 1 : 0));
  }
  function targetCloud(selector, positionX, positionY, scale = 1, future = true) {
    setTransform(selector, positionX, positionY, scale);
    selectElement(selector + ' > text').textContent = future ? 'Target' : 'Reference';
    renderRobot(
      selector + '-pose',
      samplePose('reference', motionFrame + (future ? motionData.lookaheadFrames : 0)),
      0,
      12,
      0.49,
    );
  }
  const dynamicsButtons = [...document.querySelectorAll('[data-dynamics-step]')];
  const dynamicsEquations = [...document.querySelectorAll('[data-equation-step]')];
  const dynamicsFigure = selectElement('.dynamics-figure');
  dynamicsEquations.forEach((equation) => (equation.hidden = true));
  dynamicsFigure.classList.add('timeline-ready');
  const equationSvg = selectElement('.dynamics-algebra'),
    paintEquation = window.createDynamicsEquationRenderer(equationSvg);
  function renderDynamics(progress) {
    const decompositionProgress = smooth(progress),
      physicalRolesProgress = smooth(progress - 1);
    const positionX = mix(390, 685, decompositionProgress),
      positionY = 220,
      scale = 1.23;
    const referencePose = samplePose('reference', motionFrame);
    renderRobot('.main-runner', referencePose, positionX, positionY, scale);
    targetCloud('.main-cloud', mix(580, 795, decompositionProgress), 76, 0.7);
    groundAt('.main-ground', referencePose, positionX, positionY, scale);
    forceAt('.main-force', referencePose, positionX, positionY, scale, 1 - physicalRolesProgress);
    setOpacity('.main-cloud', 1 - physicalRolesProgress);
    setOpacity('.total-label', decompositionProgress);
    drawWires('.dynamics-branch', clamp(decompositionProgress / 0.75));
    drawWires('.dynamics-sum-output', clamp((decompositionProgress - 0.75) / 0.25));
    wireStage('.contribution-links', decompositionProgress);
    setOpacity('.tracking-formula', decompositionProgress * (1 - physicalRolesProgress));
    setOpacity('.balance-formula', decompositionProgress * (1 - physicalRolesProgress));
    setTransform('.tracking-formula', 0, 0);
    setTransform('.balance-formula', 0, 0);
    setOpacity('.tracking-animation', physicalRolesProgress);
    setOpacity('.balance-animation', physicalRolesProgress);
    setTransform('.tracking-animation', 0, 0);
    setTransform('.balance-animation', 0, 0);
    const trackedPose = samplePose(
      'reference',
      motionFrame + physicalRolesProgress * motionData.lookaheadFrames,
    );
    renderRobot('.tracking-runner', trackedPose, 260, 117, 0.78);
    groundAt('.tracking-ground', trackedPose, 260, 125, 1, true);
    const left = projectLandmark(trackedPose, 'left_shoulder'),
      right = projectLandmark(trackedPose, 'right_shoulder');
    const shoulderX = 260 + (left[0] + right[0]) * 0.39,
      shoulderY = 117 + (left[1] + right[1]) * 0.39;
    selectElement('.sling path').setAttribute(
      'd',
      `M220 9H298M230 9L${shoulderX - 10} ${shoulderY}M288 9L${shoulderX + 10} ${shoulderY}`,
    );
    targetCloud('.tracking-cloud', 378, 54, 0.48);
    paintEquation(progress);
    equationSvg.style.opacity = 1;
    equationSvg.style.visibility = 'visible';
    equationSvg.setAttribute('aria-hidden', 'false');
    dynamicsEquations.forEach((panel) => {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    });
  }
  const moveDynamics = createStepTimeline(dynamicsFigure, 0, renderDynamics, 1600);
  dynamicsButtons.forEach((button) =>
    button.addEventListener('click', () => {
      dynamicsButtons.forEach((candidateButton) =>
        candidateButton.setAttribute('aria-pressed', String(candidateButton === button)),
      );
      dynamicsFigure.dataset.step = button.dataset.dynamicsStep;
      moveDynamics(Number(button.dataset.dynamicsStep));
    }),
  );
  const policyButtons = [...document.querySelectorAll('[data-sonic-step]')],
    policyFigure = selectElement('.sonic-figure');
  function renderPolicy(progress) {
    const inputsProgress = smooth(progress),
      policyProgress = smooth(progress - 1),
      pdProgress = smooth(progress - 2),
      executionProgress = smooth(progress - 3);
    const state = samplePose('policyExecution', motionFrame),
      positionX = mix(390, 85, inputsProgress),
      positionY = mix(230, 240, inputsProgress),
      scale = mix(1.25, 0.95, inputsProgress);
    renderRobot('.sonic-runner', state, positionX, positionY, scale);
    selectElement('.sonic-state-label').setAttribute('x', positionX);
    selectElement('.sonic-state-label').setAttribute('y', positionY + 60 * scale + 28);
    targetCloud(
      '.sonic-cloud',
      mix(580, 85, inputsProgress),
      mix(80, 73, inputsProgress),
      mix(0.75, 0.6, inputsProgress),
      false,
    );
    selectElement('.sonic-cloud > text').textContent = 'Reference';
    drawWires('.sonic-incoming-wire', clamp(inputsProgress / 0.75));
    drawWires('.sonic-policy-inlet', clamp((inputsProgress - 0.75) / 0.25));
    wireStage('.sonic-input-wires', inputsProgress);
    setOpacity('.policy-symbol', inputsProgress);
    drawWires('.policy-output > .control-link', policyProgress);
    wireStage('.policy-output', policyProgress);
    drawWires('.coupling-branch', clamp(policyProgress / 0.8));
    drawWires('.coupling-inlet', clamp((policyProgress - 0.8) / 0.2));
    wireStage('.coupled-objectives', policyProgress);
    renderRobot('.sonic-target', samplePose('policyTarget', motionFrame), 550, 230, 0.72);
    drawWires('.sonic-pd > .control-link', pdProgress);
    wireStage('.sonic-pd', pdProgress);
    drawWires('.sonic-output > .control-link', executionProgress);
    wireStage('.sonic-output', executionProgress);
    drawWires('.sonic-feedback-wire', executionProgress);
    setOpacity('.feedback-label', executionProgress);
    const executed = samplePose('policyExecution', motionFrame + 1);
    groundAt('.sonic-execution-ground', executed, 830, 230, 1.02);
    renderRobot('.sonic-execution', executed, 830, 230, 1.02);
  }
  const movePolicy = createStepTimeline(policyFigure, 0, renderPolicy);
  policyButtons.forEach((button, index) =>
    button.addEventListener('click', () => {
      policyButtons.forEach((candidateButton) =>
        candidateButton.setAttribute('aria-pressed', String(candidateButton === button)),
      );
      movePolicy(index);
    }),
  );
  const methodFigure = selectElement('.method-interactive-figure');
  const methodButtons = [...document.querySelectorAll('[data-method-step]')];
  const methodEquations = [...document.querySelectorAll('[data-method-equation]')];
  methodEquations.forEach((equation) => (equation.hidden = false));
  methodFigure.classList.add('timeline-ready');
  const balancingPlaceholders = [...document.querySelectorAll('.balancing-video')];
  const balancingVideo = document.createElement('video');
  balancingVideo.muted = true;
  balancingVideo.loop = true;
  balancingVideo.playsInline = true;
  balancingVideo.preload = 'auto';
  const balancingCanvases = balancingPlaceholders.map((video) => {
    const canvas = document.createElement('canvas');
    canvas.width = 420;
    canvas.height = 384;
    canvas.className = 'balancing-video';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', video.getAttribute('aria-label'));
    video.replaceWith(canvas);
    return canvas;
  });
  const balancingContexts = balancingCanvases.map((canvas) => canvas.getContext('2d'));
  const balancingPoster = new Image();
  balancingPoster.src = 'assets/animations/balancing-poster.png';
  balancingPoster.onload = () => {
    if (!motionPlaying)
      balancingContexts.forEach((context) => context.drawImage(balancingPoster, 0, 0, 420, 384));
  };
  let mediaReady = false;
  function paintBalance(mediaTime) {
    motionFrame =
      loopStartFrame + ((mediaTime * motionData.framesPerSecond + 1e-5) % loopFrameCount);
    balancingContexts[0].clearRect(0, 0, 420, 384);
    balancingContexts[0].drawImage(balancingVideo, 0, 0, 420, 384);
    for (let index = 1; index < balancingContexts.length; index++) {
      balancingContexts[index].clearRect(0, 0, 420, 384);
      balancingContexts[index].drawImage(balancingCanvases[0], 0, 0);
    }
    redraw();
  }
  if (balancingVideo.requestVideoFrameCallback) {
    const decoded = (timestamp, metadata) => {
      if (motionPlaying) paintBalance(metadata.mediaTime);
      balancingVideo.requestVideoFrameCallback(decoded);
    };
    balancingVideo.requestVideoFrameCallback(decoded);
  }
  function playBalanceVideo() {
    if (selectElement('#video-dialog').open) return;
    balancingVideo
      .play()
      .then(() => setMediaStatus(''))
      .catch(() => {
        pauseRun(false);
        setMediaStatus('Click to play the synchronized motion.', true);
      });
  }
  selectElement('#video-dialog').addEventListener('close', () => {
    if (resumePlaybackWhenVisible) startRun();
  });
  selectElement('#video-dialog').addEventListener('toggle', () => {
    if (selectElement('#video-dialog').open) pauseRun(false);
  });
  function renderMethod(progress) {
    const trackingProgress = smooth(progress),
      balancingProgress = smooth(progress - 1),
      commandProgress = smooth(progress - 2);
    const state = samplePose('dkwbcExecution', motionFrame),
      positionX = mix(390, 85, trackingProgress),
      positionY = mix(300, 340, trackingProgress),
      scale = mix(1.4, 0.95, trackingProgress);
    groundAt('.method-state-ground', state, positionX, positionY, scale);
    renderRobot('.method-state', state, positionX, positionY, scale);
    targetCloud(
      '.method-cloud',
      mix(580, 85, trackingProgress),
      mix(140, 96, trackingProgress),
      mix(0.75, 0.6, trackingProgress),
      false,
    );
    selectElement('.method-state-label').setAttribute('x', positionX);
    selectElement('.method-state-label').setAttribute('y', positionY + scale * 60 + 28);
    drawWires('.method-input-links > path', trackingProgress);
    wireStage('.method-input-links', trackingProgress);
    setOpacity('.method-tracking', trackingProgress);
    drawWires('.method-policy-input-link, .method-observation-link', balancingProgress);
    wireStage('.method-balancing', balancingProgress);
    drawRoute(
      ['.method-tracking-output-link', '.method-tracking-sum-link'],
      clamp(commandProgress / 0.8),
    );
    drawRoute(
      ['.method-policy-output-link', '.method-balancing-sum-link'],
      clamp(commandProgress / 0.8),
    );
    drawWires('.method-command-output', clamp((commandProgress - 0.8) / 0.2));
    wireStage('.method-command', commandProgress);
    drawWires('.method-feedback > .feedback-wire', commandProgress);
    wireStage('.method-feedback', commandProgress);
    setOpacity('.method-output', commandProgress);
    const trackedPose = samplePose('modelTracking', motionFrame);
    renderRobot('.method-tracking-state', trackedPose, 520, 200, 0.72);
    renderRobot(
      '.method-reference-ghost',
      samplePose('modelReference', motionFrame),
      520,
      200,
      0.72,
    );
    groundAt('.method-tracking-ground', trackedPose, 520, 215, 0.9, true);
    const shoulders = ['left_shoulder', 'right_shoulder'].map((landmarkName) =>
      projectLandmark(trackedPose, landmarkName),
    );
    const shoulderX = 520 + (shoulders[0][0] + shoulders[1][0]) * 0.36;
    const shoulderY = 200 + (shoulders[0][1] + shoulders[1][1]) * 0.36;
    selectElement('.method-sling').setAttribute(
      'd',
      `M485 110H555M495 110L${shoulderX - 10} ${shoulderY}M545 110L${shoulderX + 10} ${shoulderY}`,
    );
    const result = samplePose('dkwbcExecution', motionFrame + 1);
    groundAt('.method-execution-ground', result, 830, 330, 1.02);
    renderRobot('.method-execution', result, 830, 330, 1.02);
    methodEquations.forEach((panel, index) => {
      const weight = smooth(1 - Math.abs(progress - index));
      panel.style.opacity = weight;
      panel.style.transform = `translateY(${(index - progress) * 16}px)`;
      panel.style.visibility = weight === 0 ? 'hidden' : 'visible';
      panel.setAttribute('aria-hidden', String(index !== Math.round(progress)));
    });
  }
  const moveMethod = createStepTimeline(methodFigure, 0, renderMethod);
  methodButtons.forEach((button, index) =>
    button.addEventListener('click', () => {
      methodButtons.forEach((candidateButton) =>
        candidateButton.setAttribute('aria-pressed', String(candidateButton === button)),
      );
      moveMethod(index);
    }),
  );
  function enableCanvasAdvance(selector, buttons) {
    const canvas = selectElement(selector);
    canvas.classList.add('interactive-canvas');
    canvas.setAttribute('role', 'button');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute(
      'aria-label',
      canvas.getAttribute('aria-label') + ' Click to advance to the next step.',
    );
    const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hitbox.setAttribute('x', canvas.viewBox.baseVal.x);
    hitbox.setAttribute('y', canvas.viewBox.baseVal.y);
    hitbox.setAttribute('width', '100%');
    hitbox.setAttribute('height', '100%');
    hitbox.setAttribute('fill', 'transparent');
    hitbox.setAttribute('pointer-events', 'all');
    hitbox.setAttribute('aria-hidden', 'true');
    canvas.prepend(hitbox);
    const advance = () => {
      if (canvas.closest('figure').dataset.animating === 'true') return;
      const currentStepIndex = buttons.findIndex(
        (button) => button.getAttribute('aria-pressed') === 'true',
      );
      buttons[(currentStepIndex + 1) % buttons.length].click();
    };
    canvas.addEventListener('click', advance);
    canvas.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) advance();
      }
    });
  }
  function storyNavigation(storyFigure, buttons) {
    const stepControls = storyFigure.querySelector('.diagram-controls');
    stepControls.removeAttribute('title');
    const navigationHint = document.createElement('span');
    navigationHint.className = 'sr-only';
    navigationHint.id = `${storyFigure.classList[0]}-hint`;
    navigationHint.textContent =
      'Click a step, or click the diagram to advance. Wait for the transition to finish before clicking again.';
    const statusElement = document.createElement('span');
    statusElement.className = 'sr-only';
    statusElement.setAttribute('role', 'status');
    storyFigure.append(navigationHint, statusElement);
    const touchCue = document.createElement('span');
    touchCue.className = 'story-touch-cue';
    const cueIcon = document.createElement('i');
    cueIcon.className = 'fa fa-hand-pointer-o';
    cueIcon.setAttribute('aria-hidden', 'true');
    const cueText = document.createElement('span');
    cueText.textContent = 'Tap diagram to continue';
    touchCue.append(cueIcon, cueText);
    storyFigure.append(touchCue);
    const tooltip = document.createElement('span');
    tooltip.className = 'story-pointer-cue';
    tooltip.hidden = true;
    tooltip.setAttribute('aria-hidden', 'true');
    const tooltipIcon = document.createElement('i');
    tooltipIcon.setAttribute('aria-hidden', 'true');
    const tooltipText = document.createElement('span');
    tooltip.append(tooltipIcon, tooltipText);
    document.body.append(tooltip);
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let pointer = null;
    function updateTooltip() {
      if (!pointer || !finePointer.matches) {
        tooltip.hidden = true;
        return;
      }
      const isAnimating = storyFigure.dataset.animating === 'true',
        isLastStep = currentStepIndex() === buttons.length - 1;
      tooltipIcon.className = `fa ${isAnimating ? 'fa-hourglass-o' : 'fa-hand-pointer-o'}`;
      tooltipText.textContent = isAnimating
        ? 'Animating…'
        : pointer.step
          ? 'Click to view step'
          : isLastStep
            ? 'Click to replay'
            : 'Click to continue';
      tooltip.hidden = false;
      const width = tooltip.offsetWidth,
        height = tooltip.offsetHeight;
      tooltip.style.left = `${Math.max(8, Math.min(pointer.x + 18, innerWidth - width - 8))}px`;
      tooltip.style.top = `${pointer.y + height + 24 > innerHeight ? Math.max(8, pointer.y - height - 12) : pointer.y + 20}px`;
    }
    storyFigure.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const targetStep = event.target.closest('.interactive-canvas,.diagram-controls button');
      pointer = targetStep
        ? {
            x: event.clientX,
            y: event.clientY,
            step: targetStep.tagName === 'BUTTON',
          }
        : null;
      updateTooltip();
    });
    function hideTooltip() {
      pointer = null;
      tooltip.hidden = true;
    }
    storyFigure.addEventListener('pointerleave', hideTooltip);
    window.addEventListener('scroll', hideTooltip, {
      passive: true,
    });
    document.addEventListener('visibilitychange', hideTooltip);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideTooltip();
    });
    finePointer.addEventListener('change', hideTooltip);
    const canvas = storyFigure.querySelector('.interactive-canvas');
    canvas.addEventListener('focus', () => touchCue.classList.add('is-keyboard-visible'));
    canvas.addEventListener('blur', () => touchCue.classList.remove('is-keyboard-visible'));
    stepControls.style.setProperty('--step-count', buttons.length);
    const icons = buttons.map((button) => {
      const icon = document.createElement('i');
      icon.className = 'fa fa-hand-pointer-o step-click-icon';
      icon.setAttribute('aria-hidden', 'true');
      button.append(icon);
      return icon;
    });
    const currentStepIndex = () =>
      Math.max(
        0,
        buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true'),
      );
    function update() {
      const isAnimating = storyFigure.dataset.animating === 'true',
        stepIndex = currentStepIndex(),
        nextStepIndex = (stepIndex + 1) % buttons.length;
      buttons.forEach((button, index) => {
        button.disabled = isAnimating;
        button.classList.toggle('is-suggested', !isAnimating && index === nextStepIndex);
        button.classList.toggle('is-transitioning', isAnimating && index === stepIndex);
        icons[index].className =
          `fa ${isAnimating ? 'fa-hourglass-o' : 'fa-hand-pointer-o'} step-click-icon`;
      });
      statusElement.textContent = isAnimating
        ? 'Animating…'
        : `Step ${stepIndex + 1} of ${buttons.length}`;
      storyFigure
        .querySelector('.interactive-canvas')
        .setAttribute('aria-disabled', String(isAnimating));
      cueIcon.className = `fa ${isAnimating ? 'fa-hourglass-o' : 'fa-hand-pointer-o'}`;
      cueText.textContent = isAnimating
        ? 'Animating…'
        : stepIndex === buttons.length - 1
          ? 'Tap diagram to replay'
          : 'Tap diagram to continue';
      updateTooltip();
    }
    storyFigure.addEventListener('storychange', update);
    storyFigure.addEventListener(
      'click',
      (event) => {
        if (storyFigure.dataset.autoplayAdvancing !== 'true')
          storyFigure.dispatchEvent(new Event('storymanual'));
        if (
          storyFigure.dataset.animating === 'true' &&
          event.target.closest('button,.interactive-canvas')
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    storyFigure
      .querySelector('.interactive-canvas')
      .setAttribute('aria-describedby', navigationHint.id);
    update();
  }
  enableCanvasAdvance('.dynamics-canvas', dynamicsButtons);
  enableCanvasAdvance('.sonic-canvas', policyButtons);
  enableCanvasAdvance('.method-canvas', methodButtons);
  storyNavigation(dynamicsFigure, dynamicsButtons);
  storyNavigation(policyFigure, policyButtons);
  storyNavigation(methodFigure, methodButtons);
  function redraw() {
    renderDynamics(Number(dynamicsFigure.dataset.progress));
    renderPolicy(Number(policyFigure.dataset.progress));
    renderMethod(Number(methodFigure.dataset.progress));
  }
  function pauseRun(userInitiated = true) {
    if (userInitiated) resumePlaybackWhenVisible = false;
    motionPlaying = false;
    cancelAnimationFrame(playbackAnimationFrame);
    playbackAnimationFrame = 0;
    balancingVideo.pause();
  }
  function startRun() {
    resumePlaybackWhenVisible = true;
    if (
      !framesReady ||
      !mediaReady ||
      !hasVisibleStory ||
      document.hidden ||
      motionPlaying ||
      reducedMotion.matches ||
      selectElement('#video-dialog').open
    )
      return;
    if (motionFrame < loopStartFrame || motionFrame >= loopEndFrame) motionFrame = loopStartFrame;
    motionPlaying = true;
    playBalanceVideo();
    redraw();
    playbackAnimationFrame = requestAnimationFrame(play);
  }
  function play() {
    if (!motionPlaying) return;
    if (
      !balancingVideo.requestVideoFrameCallback &&
      !balancingVideo.paused &&
      balancingVideo.readyState >= 2
    )
      paintBalance(balancingVideo.currentTime);
    playbackAnimationFrame = requestAnimationFrame(play);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseRun(false);
    else if (resumePlaybackWhenVisible) startRun();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) pauseRun(false);
    else startRun();
  });
  let loadMotion = () => {};
  const mediaStatuses = [dynamicsFigure, policyFigure, methodFigure].map((storyFigure) => {
    const statusElement = document.createElement('button');
    statusElement.type = 'button';
    statusElement.className = 'motion-load-status';
    statusElement.hidden = true;
    statusElement.addEventListener('click', () => {
      if (mediaReady && framesReady) startRun();
      else loadMotion();
    });
    storyFigure.querySelector('.diagram-controls').after(statusElement);
    return statusElement;
  });
  function setMediaStatus(message, retry = false) {
    mediaStatuses.forEach((statusElement) => {
      statusElement.hidden = !message;
      statusElement.textContent = message;
      statusElement.disabled = !retry;
    });
  }
  const visibleStories = new Set();
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visibleStories.add(entry.target);
      else visibleStories.delete(entry.target);
    });
    hasVisibleStory = visibleStories.size > 0;
    if (!hasVisibleStory) pauseRun(false);
    else if (resumePlaybackWhenVisible) startRun();
  });
  [dynamicsFigure, policyFigure, methodFigure].forEach((storyFigure) =>
    visibilityObserver.observe(storyFigure),
  );
  let preloadStarted = false;
  const preloadObserver = new IntersectionObserver(
    (entries) => {
      if (preloadStarted || !entries.some((entry) => entry.isIntersecting)) return;
      preloadStarted = true;
      preloadObserver.disconnect();
      const pendingFrameUrls = [];
      const frameRanges = {
        reference: [loopStartFrame, loopEndFrame + motionData.lookaheadFrames],
        policyExecution: [loopStartFrame, loopEndFrame + 1],
        policyTarget: [loopStartFrame, loopEndFrame],
        dkwbcExecution: [loopStartFrame, loopEndFrame + 1],
        modelTracking: [loopStartFrame, loopEndFrame],
        modelReference: [loopStartFrame, loopEndFrame],
      };
      for (const [stream, [start, end]] of Object.entries(frameRanges)) {
        for (let index = start; index < end; index++)
          pendingFrameUrls.push(
            `assets/motion-frames/${stream}/${String(index).padStart(3, '0')}.webp`,
          );
      }
      const preloadedImages = new Map();
      async function preload() {
        while (pendingFrameUrls.length) {
          const url = pendingFrameUrls.shift(),
            image = new Image();
          image.src = url;
          await image.decode();
          preloadedImages.set(url, image);
        }
      }
      const loadFrames = async () => {
        const results = await Promise.allSettled(
          Array.from(
            {
              length: 6,
            },
            () => preload(),
          ),
        );
        if (results.some((result) => result.status === 'rejected'))
          throw new Error('Frame load failed');
        framesReady = true;
      };
      async function loadMedia() {
        setMediaStatus('Loading synchronized motion…');
        try {
          if (!framesReady) await loadFrames();
          if (!mediaReady) {
            const videoFormat = balancingVideo.canPlayType('video/webm; codecs="vp9"')
              ? 'webm'
              : 'mp4';
            const url = await window.DKWBCMedia.cachedURL(
              `assets/animations/${videoFormat === 'webm' ? 'balancing-loop.webm' : 'balancing-loop-white.mp4'}`,
            );
            await new Promise((resolve, reject) => {
              if (window.origin === 'null') balancingVideo.onloadedmetadata = resolve;
              else balancingVideo.onloadeddata = resolve;
              balancingVideo.onerror = reject;
              balancingVideo.src = url;
              balancingVideo.load();
            });
            mediaReady = true;
          }
          setMediaStatus('');
          if (resumePlaybackWhenVisible) startRun();
          document.dispatchEvent(new Event('storyready'));
        } catch {
          if (!framesReady) {
            preloadedImages.clear();
            pendingFrameUrls.length = 0;
            for (const [stream, [start, end]] of Object.entries(frameRanges))
              for (let index = start; index < end; index++)
                pendingFrameUrls.push(
                  `assets/motion-frames/${stream}/${String(index).padStart(3, '0')}.webp`,
                );
          }
          setMediaStatus('Motion could not load. Click to retry.', true);
        }
      }
      loadMotion = loadMedia;
      loadMedia();
    },
    {
      rootMargin: '600px',
    },
  );
  preloadObserver.observe(dynamicsFigure);
  preloadObserver.observe(methodFigure);
  function autoAdvance(storyFigure, buttons) {
    let isVisible = false,
      manuallyControlled = false,
      sequenceComplete = false,
      advanceTimer = 0;
    const currentStepIndex = () =>
      Math.max(
        0,
        buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true'),
      );
    const clear = () => {
      clearTimeout(advanceTimer);
      advanceTimer = 0;
    };
    const ready = () =>
      isVisible &&
      framesReady &&
      mediaReady &&
      !reducedMotion.matches &&
      !document.hidden &&
      !selectElement('#video-dialog').open;
    function refresh() {
      clear();
      if (manuallyControlled) {
        storyFigure.dataset.autoplay = 'manual';
        return;
      }
      if (reducedMotion.matches) {
        storyFigure.dataset.autoplay = 'reduced-motion';
        return;
      }
      if (storyFigure.dataset.animating === 'true') {
        storyFigure.dataset.autoplay = 'transitioning';
        return;
      }
      if (currentStepIndex() === buttons.length - 1) sequenceComplete = true;
      if (sequenceComplete) {
        storyFigure.dataset.autoplay = 'complete';
        return;
      }
      storyFigure.dataset.autoplay = ready() ? 'playing' : 'paused';
      if (!ready()) return;
      advanceTimer = setTimeout(() => {
        advanceTimer = 0;
        if (
          !ready() ||
          manuallyControlled ||
          sequenceComplete ||
          storyFigure.dataset.animating === 'true'
        ) {
          refresh();
          return;
        }
        storyFigure.dataset.autoplayAdvancing = 'true';
        try {
          buttons[currentStepIndex() + 1].click();
        } finally {
          delete storyFigure.dataset.autoplayAdvancing;
        }
      }, 2800);
    }
    function stop() {
      manuallyControlled = true;
      refresh();
    }
    storyFigure.addEventListener('storymanual', stop);
    storyFigure.addEventListener(
      'pointerdown',
      (event) => {
        if (event.target.closest('button:disabled')) stop();
      },
      true,
    );
    storyFigure.addEventListener('storychange', refresh);
    document.addEventListener('storyready', refresh);
    document.addEventListener('visibilitychange', refresh);
    reducedMotion.addEventListener('change', refresh);
    selectElement('#video-dialog').addEventListener('toggle', refresh);
    selectElement('#video-dialog').addEventListener('close', refresh);
    new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.25;
        refresh();
      },
      {
        threshold: [0, 0.25],
        rootMargin: '-70px 0px -8% 0px',
      },
    ).observe(storyFigure);
    refresh();
  }
  autoAdvance(dynamicsFigure, dynamicsButtons);
  autoAdvance(policyFigure, policyButtons);
  autoAdvance(methodFigure, methodButtons);
})();
