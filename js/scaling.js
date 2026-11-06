'use strict';

(() => {
  const scalingData = window.DKWBCScalingData,
    scalingFigure = document.getElementById('scaling-explorer');
  if (!scalingData || !scalingFigure) return;
  const dataset = scalingData,
    pageStyles = getComputedStyle(document.documentElement),
    colors = {
      DKWBC: pageStyles.getPropertyValue('--chart-dkwbc').trim(),
      SONIC: pageStyles.getPropertyValue('--chart-sonic').trim(),
    };
  const svgNamespace = 'http://www.w3.org/2000/svg';
  function createSvgElement(tag, attributes = {}, text) {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [attributeName, attributeValue] of Object.entries(attributes))
      element.setAttribute(attributeName, attributeValue);
    if (text !== undefined) element.textContent = text;
    return element;
  }
  let compactLayout = null;
  function render(isCompact) {
    const chartWidth = isCompact ? 500 : 720,
      chartHeight = 390,
      chartLeft = isCompact ? 36 : 44,
      curveRight = chartWidth - 162,
      chartRight = curveRight;
    const scaleHours = (hours) =>
      chartLeft + ((Math.log2(hours) - 1) / 6) * (curveRight - chartLeft);
    const metrics = [
      {
        key: 'success',
        title: 'Success rate ↑',
        unit: '%',
        min: 85,
        max: 101,
        top: 38,
        bottom: 156,
        ticks: [85, 90, 95, 100],
      },
      {
        key: 'mpjpe',
        title: 'MPJPE ↓',
        unit: 'mm',
        min: 20,
        max: 34,
        top: 208,
        bottom: 326,
        ticks: [20, 24, 28, 32],
      },
    ];
    const svg = createSvgElement('svg', {
      viewBox: `0 0 ${chartWidth} ${chartHeight}`,
      role: 'group',
      'aria-label':
        'BONES-SEED test-repetition: success rate and MPJPE share the training-data axis.',
    });
    const guides = [],
      pointNodes = [];
    for (const metric of metrics) {
      metric.y = (value) =>
        metric.bottom -
        ((value - metric.min) / (metric.max - metric.min)) * (metric.bottom - metric.top);
      const metricGroup = createSvgElement('g', {
        'data-metric': metric.key,
      });
      metricGroup.append(
        createSvgElement(
          'text',
          {
            x: chartLeft,
            y: metric.top - 18,
            class: 'metric-title',
          },
          metric.title,
        ),
      );
      metricGroup.append(
        createSvgElement(
          'text',
          {
            x: chartRight,
            y: metric.top - 18,
            'text-anchor': 'end',
            class: 'curve-unit',
          },
          metric.unit,
        ),
      );
      for (const tick of metric.ticks) {
        metricGroup.append(
          createSvgElement('line', {
            x1: chartLeft,
            x2: chartRight,
            y1: metric.y(tick),
            y2: metric.y(tick),
            class: 'curve-gridline',
          }),
        );
        metricGroup.append(
          createSvgElement(
            'text',
            {
              x: chartLeft - 10,
              y: metric.y(tick) + 5,
              'text-anchor': 'end',
              class: 'curve-axis-label',
            },
            String(tick),
          ),
        );
      }
      metricGroup.append(
        createSvgElement('line', {
          x1: chartLeft,
          x2: chartRight,
          y1: metric.bottom,
          y2: metric.bottom,
          class: 'curve-axis',
        }),
      );
      for (const method of ['DKWBC', 'SONIC']) {
        const rows = scalingData.hours.map((hours) =>
          dataset.rows.find((row) => row.method === method && row.hours === hours),
        );
        if (metric.key === 'success') {
          const edges = [
            ...rows.map((row) => [
              scaleHours(row.hours),
              metric.y(row.success + row.successDeviation),
            ]),
            ...rows
              .slice()
              .reverse()
              .map((row) => [scaleHours(row.hours), metric.y(row.success - row.successDeviation)]),
          ];
          metricGroup.append(
            createSvgElement('path', {
              d:
                edges.map((point, index) => `${index ? 'L' : 'M'}${point.join(',')}`).join(' ') +
                'Z',
              fill: colors[method],
              'fill-opacity': 0.1,
              class: 'curve-band',
            }),
          );
        }
        metricGroup.append(
          createSvgElement('path', {
            d: rows
              .map(
                (row, index) =>
                  `${index ? 'L' : 'M'}${scaleHours(row.hours)},${metric.y(row[metric.key])}`,
              )
              .join(' '),
            fill: 'none',
            stroke: colors[method],
            'stroke-width': 2.4,
            'stroke-linejoin': 'round',
            class: 'data-curve',
            'data-method': method,
          }),
        );
        rows.forEach((row) => pointNodes.push(makePoint(row, metric)));
      }
      const endRows = ['DKWBC', 'SONIC']
        .map((method) => dataset.rows.find((row) => row.method === method && row.hours === 128))
        .sort(
          (firstRow, secondRow) => metric.y(firstRow[metric.key]) - metric.y(secondRow[metric.key]),
        );
      let lastY = -Infinity;
      for (const row of endRows) {
        const pointY = metric.y(row[metric.key]),
          labelY = Math.max(metric.top + 9, pointY, lastY + 29);
        lastY = labelY;
        metricGroup.append(
          createSvgElement('path', {
            d: `M${chartRight + 7} ${pointY}L${chartRight + 19} ${labelY}H${chartRight + 26}`,
            fill: 'none',
            stroke: colors[row.method],
            'stroke-opacity': 0.55,
            'stroke-width': 1,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: 'curve-end-leader',
          }),
        );
        const label = createSvgElement('text', {
          x: chartRight + 32,
          y: labelY + 5,
          fill: colors[row.method],
          class: 'curve-end-label',
          'data-method': row.method,
          'data-metric': metric.key,
        });
        label.append(
          createSvgElement('tspan', {}, row.method + ' '),
          createSvgElement(
            'tspan',
            {
              class: 'curve-end-value',
            },
            row[metric.key].toFixed(2) + (metric.key === 'success' ? '%' : ''),
          ),
        );
        metricGroup.append(label);
      }
      const guide = createSvgElement('line', {
        y1: metric.top,
        y2: metric.bottom,
        class: 'curve-guide',
        visibility: 'hidden',
      });
      guides.push(guide);
      metricGroup.append(guide);
      svg.append(metricGroup);
    }
    for (const hours of scalingData.hours)
      svg.append(
        createSvgElement(
          'text',
          {
            x: scaleHours(hours),
            y: 350,
            'text-anchor': 'middle',
            class: 'curve-axis-label',
          },
          String(hours),
        ),
      );
    svg.append(
      createSvgElement(
        'text',
        {
          x: (chartLeft + chartRight) / 2,
          y: 380,
          'text-anchor': 'middle',
          class: 'curve-axis-label',
        },
        'Training data (hours, log₂ scale)',
      ),
    );
    const annotations = createSvgElement('g', {
      class: 'curve-values',
      visibility: 'hidden',
      'pointer-events': 'none',
    });
    svg.append(...pointNodes, annotations);
    function inspect(hours) {
      const pointX = scaleHours(hours),
        rows = ['DKWBC', 'SONIC'].map((method) =>
          dataset.rows.find((row) => row.method === method && row.hours === hours),
        );
      guides.forEach((guide) => {
        guide.setAttribute('x1', pointX);
        guide.setAttribute('x2', pointX);
        guide.setAttribute('visibility', 'visible');
      });
      annotations.replaceChildren();
      annotations.setAttribute('visibility', 'visible');
      const descriptions = [];
      for (const metric of metrics) {
        const sortedRows = rows
          .slice()
          .sort(
            (firstRow, secondRow) =>
              metric.y(firstRow[metric.key]) - metric.y(secondRow[metric.key]),
          );
        const labelsOverlap =
          sortedRows.length === 2 &&
          Math.abs(metric.y(sortedRows[0][metric.key]) - metric.y(sortedRows[1][metric.key])) < 32;
        sortedRows.forEach((row, index) => {
          const pointY = metric.y(row[metric.key]),
            color = colors[row.method],
            anchor = pointX > curveRight - 30 ? 'end' : 'start';
          const labelY = Math.max(
            metric.top + 12,
            Math.min(metric.bottom - 3, pointY + (labelsOverlap && index === 1 ? 21 : -10)),
          );
          const value = row[metric.key].toFixed(2) + (metric.key === 'success' ? '%' : ' mm');
          annotations.append(
            createSvgElement('circle', {
              cx: pointX,
              cy: pointY,
              r: 6.5,
              fill: 'none',
              stroke: color,
              'stroke-width': 1.4,
            }),
          );
          annotations.append(
            createSvgElement(
              'text',
              {
                x: pointX + (anchor === 'end' ? -12 : 12),
                y: labelY,
                'text-anchor': anchor,
                fill: color,
                class: 'curve-value',
                'data-method': row.method,
                'data-metric': metric.key,
              },
              value,
            ),
          );
          descriptions.push(`${row.method}, ${metric.key}: ${value}`);
        });
      }
      scalingFigure.querySelector('.curve-announcement').textContent =
        `${hours} hours. ${descriptions.join('; ')}`;
    }
    function clear() {
      [...guides, annotations].forEach((node) => node.setAttribute('visibility', 'hidden'));
    }
    function makePoint(row, metric) {
      const pointX = scaleHours(row.hours),
        pointY = metric.y(row[metric.key]),
        method = row.method;
      const pointGroup = createSvgElement('g', {
        class: 'curve-point',
        tabindex: 0,
        role: 'button',
        'data-method': method,
        'data-hours': row.hours,
        'data-metric': metric.key,
        'aria-label': `${method}, ${row.hours} hours, ${metric.title}: ${row[metric.key].toFixed(2)} ${metric.unit}`,
      });
      pointGroup.append(
        createSvgElement('circle', {
          cx: pointX,
          cy: pointY,
          r: 12,
          fill: 'transparent',
        }),
      );
      pointGroup.append(
        createSvgElement(
          method === 'SONIC' ? 'rect' : 'circle',
          method === 'SONIC'
            ? {
                x: pointX - 2.8,
                y: pointY - 2.8,
                width: 5.6,
                height: 5.6,
                rx: 1,
                fill: colors[method],
                stroke: 'white',
                'stroke-width': 1.1,
              }
            : {
                cx: pointX,
                cy: pointY,
                r: 3.6,
                fill: colors[method],
                stroke: 'white',
                'stroke-width': 1.2,
              },
        ),
      );
      ['pointerenter', 'focus', 'click'].forEach((event) =>
        pointGroup.addEventListener(event, () => inspect(row.hours)),
      );
      pointGroup.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inspect(row.hours);
        }
        if (event.key === 'Escape') clear();
      });
      pointGroup.addEventListener('blur', clear);
      return pointGroup;
    }
    svg.addEventListener('pointermove', (event) => {
      const screenPoint = svg.createSVGPoint();
      screenPoint.x = event.clientX;
      screenPoint.y = event.clientY;
      const pointerPosition = screenPoint.matrixTransform(svg.getScreenCTM().inverse());
      if (
        pointerPosition.x < chartLeft - 12 ||
        pointerPosition.x > chartRight ||
        !metrics.some(
          (metric) => pointerPosition.y >= metric.top && pointerPosition.y <= metric.bottom,
        )
      ) {
        clear();
        return;
      }
      const hours = scalingData.hours.reduce((closestHours, hours) =>
        Math.abs(scaleHours(hours) - pointerPosition.x) <
        Math.abs(scaleHours(closestHours) - pointerPosition.x)
          ? hours
          : closestHours,
      );
      inspect(hours);
    });
    svg.addEventListener('pointerleave', () => {
      if (!svg.contains(document.activeElement)) clear();
    });
    scalingFigure.querySelector('.curve-canvas').replaceChildren(svg);
    scalingFigure.hidden = false;
  }
  function resize() {
    const nextCompactLayout = scalingFigure.parentElement.clientWidth < 480;
    if (nextCompactLayout !== compactLayout) {
      compactLayout = nextCompactLayout;
      render(nextCompactLayout);
    }
  }
  resize();
  new ResizeObserver(resize).observe(scalingFigure.parentElement);
})();
