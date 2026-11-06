'use strict';

window.createDynamicsEquationRenderer = function (equationSvg) {
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const ease = (value) => {
    value = clamp(value);
    return value * value * (3 - 2 * value);
  };
  const mix = (startValue, endValue, fraction) => startValue + (endValue - startValue) * fraction;
  const equationNodes = Object.fromEntries(
    [...equationSvg.querySelectorAll('[data-algebra]')].map((element) => [
      element.dataset.algebra,
      element,
    ]),
  );
  let layout = null,
    lastProgress = 0,
    lastPaintedProgress = null,
    lastWidth = 0;
  const measureTextWidth = (name) => equationNodes[name].getComputedTextLength();
  function measure() {
    const width = equationSvg.getBoundingClientRect().width,
      height = equationSvg.getBoundingClientRect().height;
    if (!width || !height) return;
    const fontSize = parseFloat(getComputedStyle(equationNodes.motion).fontSize),
      lineHeight = fontSize * 1.7;
    const isStacked = height > lineHeight * 1.5,
      termGap = isStacked ? 10 : 16,
      iconScale = fontSize / 28;
    equationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const termWidths = {
      motion: measureTextWidth('motion'),
      contact: measureTextWidth('contact'),
      torque: measureTextWidth('torque'),
      actuation: measureTextWidth('actuation'),
      projection: measureTextWidth('contactProjection'),
      open: measureTextWidth('open'),
      close: measureTextWidth('close'),
      equals: measureTextWidth('equals'),
      sign: 18 * iconScale,
    };
    const arrangeRow = (items, right = false) => {
      const total =
        items.reduce((sum, [, termWidth]) => sum + termWidth, 0) + termGap * (items.length - 1);
      let positionX = right ? width - total - 12 : (width - total) / 2;
      return Object.fromEntries(
        items.map(([name, termWidth]) => {
          const item = [name, positionX];
          positionX += termWidth + termGap;
          return item;
        }),
      );
    };
    const startPositions = arrangeRow([
      ['motion', termWidths.motion],
      ['equals', termWidths.equals],
      ['torque', termWidths.actuation + termWidths.torque],
      ...(!isStacked
        ? [
            ['sign', termWidths.sign],
            ['contact', termWidths.contact],
          ]
        : []),
    ]);
    const endPositions = arrangeRow([
      ['torque', termWidths.torque],
      ['equals', termWidths.equals],
      ['motion', termWidths.projection + termWidths.open + termWidths.motion + termWidths.close],
      ...(!isStacked
        ? [
            ['sign', termWidths.sign],
            ['contact', termWidths.projection + 5 + termWidths.contact],
          ]
        : []),
    ]);
    if (isStacked) {
      Object.assign(
        startPositions,
        arrangeRow(
          [
            ['sign', termWidths.sign],
            ['contact', termWidths.contact],
          ],
          true,
        ),
      );
      Object.assign(
        endPositions,
        arrangeRow(
          [
            ['sign', termWidths.sign],
            ['contact', termWidths.projection + 5 + termWidths.contact],
          ],
          true,
        ),
      );
    }
    const captionWidths = Object.fromEntries(
      ['motionLabel', 'contactLabel', 'motionRoleLabel', 'contactRoleLabel'].map((name) => [
        name,
        measureTextWidth(name),
      ]),
    );
    layout = {
      termWidths,
      startPositions,
      endPositions,
      baselineY: lineHeight * 0.7,
      contactBaselineY: lineHeight * 0.7 + (isStacked ? lineHeight : 0),
      arcHeight: fontSize * 0.4,
      isStacked,
      lineHeight,
      width,
      height,
      iconScale,
      fontSize,
      captionWidths,
    };
    lastPaintedProgress = null;
    paint(lastProgress);
  }
  function place(name, positionX, baselineY, scale = 1) {
    const node = equationNodes[name];
    node.setAttribute(
      'transform',
      `translate(${positionX.toFixed(3)} ${baselineY.toFixed(3)}) scale(${scale.toFixed(5)} 1)`,
    );
    node.style.visibility = scale > 1e-6 ? 'visible' : 'hidden';
  }
  function caption(name, positionX, baselineY) {
    const halfCaptionWidth = layout.captionWidths[name] / 2 + 2;
    place(
      name,
      Math.max(halfCaptionWidth, Math.min(layout.width - halfCaptionWidth, positionX)),
      baselineY,
    );
  }
  function paint(progress) {
    lastProgress = progress;
    if (!layout || lastPaintedProgress === progress) return;
    lastPaintedProgress = progress;
    const {
      termWidths,
      startPositions,
      endPositions,
      arcHeight,
      isStacked,
      lineHeight,
      height,
      iconScale,
      fontSize,
    } = layout;
    const captionShift = 6 * ease((progress - 0.85) / 0.15),
      baselineY = layout.baselineY - captionShift,
      contactBaselineY = layout.contactBaselineY - captionShift;
    const rolesProgress = ease(progress - 1),
      reorderProgress = ease(progress / 0.48),
      projectionProgress = ease((progress - 0.48) / 0.52);
    const reorderOffset = Math.sin(Math.PI * reorderProgress) * arcHeight;
    const motionX = mix(
        startPositions.motion,
        endPositions.motion + termWidths.projection + termWidths.open,
        reorderProgress,
      ),
      motionY = baselineY - reorderOffset;
    const torqueX = mix(
        startPositions.torque + termWidths.actuation,
        endPositions.torque,
        reorderProgress,
      ),
      torqueY = baselineY + reorderOffset;
    const contactX = mix(
      startPositions.contact,
      endPositions.contact + termWidths.projection + 5,
      reorderProgress,
    );
    place('motion', motionX, motionY);
    place('torque', torqueX, torqueY);
    place('contact', contactX, contactBaselineY);
    const projectionX = mix(
        torqueX - termWidths.actuation,
        endPositions.motion,
        projectionProgress,
      ),
      projectionY = torqueY - fontSize * 0.35 * Math.sin(Math.PI * projectionProgress);
    place('actuation', projectionX, projectionY);
    equationSvg.querySelector('[data-algebra-transpose]').style.visibility =
      projectionX < endPositions.equals || projectionProgress === 0 ? 'visible' : 'hidden';
    place('open', motionX - termWidths.open * projectionProgress, motionY, projectionProgress);
    place('close', motionX + termWidths.motion, motionY, projectionProgress);
    const splitX = mix(torqueX - termWidths.actuation, endPositions.contact, projectionProgress);
    const splitY =
      mix(torqueY, contactBaselineY, projectionProgress) +
      fontSize * 0.25 * Math.sin(Math.PI * projectionProgress);
    place('contactProjection', splitX, splitY);
    equationNodes.contactProjection.style.visibility =
      projectionProgress > 0 ? 'visible' : 'hidden';
    place('equals', mix(startPositions.equals, endPositions.equals, reorderProgress), baselineY);
    equationNodes.sign.setAttribute(
      'transform',
      `translate(${mix(startPositions.sign, endPositions.sign, reorderProgress) + 9 * iconScale} ${contactBaselineY - 9 * iconScale}) scale(${iconScale})`,
    );
    equationNodes.signVertical.setAttribute(
      'transform',
      `scale(1 ${(progress > 1 ? 1 : 1 - reorderProgress).toFixed(5)})`,
    );
    equationNodes.signVertical.style.opacity = progress > 1 ? rolesProgress : 1;
    caption(
      'motionLabel',
      endPositions.motion +
        (termWidths.projection + termWidths.open + termWidths.motion + termWidths.close) / 2,
      isStacked ? lineHeight - 2 : height - 1,
    );
    caption(
      'contactLabel',
      endPositions.contact + (termWidths.projection + 5 + termWidths.contact) / 2,
      height - 1,
    );
    equationNodes.motionLabel.style.visibility = progress >= 1 ? 'visible' : 'hidden';
    equationNodes.contactLabel.style.visibility = progress >= 1 ? 'visible' : 'hidden';
    for (const name of [
      'motion',
      'actuation',
      'open',
      'close',
      'contactProjection',
      'contact',
      'motionLabel',
      'contactLabel',
    ]) {
      equationNodes[name].style.opacity = 1 - rolesProgress;
      if (rolesProgress === 1) equationNodes[name].style.visibility = 'hidden';
    }
    const motionCenter =
        endPositions.motion +
        (termWidths.projection + termWidths.open + termWidths.motion + termWidths.close) / 2,
      contactCenter = endPositions.contact + (termWidths.projection + 5 + termWidths.contact) / 2;
    place('motionRole', motionCenter, baselineY);
    place('contactRole', contactCenter, contactBaselineY);
    caption('motionRoleLabel', motionCenter, isStacked ? lineHeight - 2 : height - 1);
    caption('contactRoleLabel', contactCenter, height - 1);
    for (const name of ['motionRole', 'contactRole', 'motionRoleLabel', 'contactRoleLabel']) {
      equationNodes[name].style.opacity = rolesProgress;
      equationNodes[name].style.visibility = rolesProgress > 0 ? 'visible' : 'hidden';
    }
    equationSvg.dataset.moveProgress = reorderProgress.toFixed(5);
    equationSvg.dataset.projectionProgress = projectionProgress.toFixed(5);
    equationSvg.dataset.distributionProgress = projectionProgress.toFixed(5);
    equationSvg.setAttribute(
      'aria-label',
      progress >= 1.5
        ? 'Joint torque equals the motion contribution plus the environmental contribution'
        : progress === 0
          ? 'M nu dot plus h equals S transpose tau plus sum J transpose lambda'
          : progress < 1
            ? 'Rearrange, then project onto actuated joints using S S transpose equals identity'
            : 'Tau equals S times M nu dot plus h minus S sum J transpose lambda',
    );
  }
  measure();
  new ResizeObserver((entries) => {
    const observedWidth = entries[0].contentRect.width;
    if (observedWidth !== lastWidth) {
      lastWidth = observedWidth;
      measure();
    }
  }).observe(equationSvg.parentElement);
  document.fonts.ready.then(measure);
  return paint;
};
