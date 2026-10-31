import { color, decibansToProbability } from '../dist/index.js';
import { absoluteFromY, positionAbsolute } from './geometry.js';

const NEUTRAL_RGB = [248, 250, 252];
const RULER_HEIGHT = 28;
let backgroundCanvas;
let backgroundContext;
let backgroundImage;
let lastBackground;

function resizeCanvas(element, context, width, height) {
  const ratio = window.devicePixelRatio || 1;
  element.width = Math.max(1, Math.round(width * ratio));
  element.height = Math.max(1, Math.round(height * ratio));
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function numberText(value, i18n) { return i18n.number(Number(value.toFixed(1)), { maximumFractionDigits: 1 }); }
function percentageText(weight, i18n) {
  const value = decibansToProbability({ weightDecibans: weight }).probability * 100;
  if (value >= 99.5) return `>${i18n.percent(.99, { maximumFractionDigits: 0 })}`;
  if (value <= .5) return `<${i18n.percent(.01, { maximumFractionDigits: 0 })}`;
  if (Math.abs(value - 50) < .05) return i18n.percent(.5, { maximumFractionDigits: 0 });
  return `~${i18n.percent(Math.round(value) / 100, { maximumFractionDigits: 0 })}`;
}

function drawArrowhead(context, segment, tint, selected) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy);
  if (length < .01 || !segment.trueEnd) return;
  const size = Math.min(selected ? 16 : 13, length * .45);
  const angle = Math.atan2(dy, dx);
  context.beginPath(); context.moveTo(segment.x2, segment.y2);
  context.lineTo(segment.x2 - size * Math.cos(angle - Math.PI / 6), segment.y2 - size * Math.sin(angle - Math.PI / 6));
  context.lineTo(segment.x2 - size * Math.cos(angle + Math.PI / 6), segment.y2 - size * Math.sin(angle + Math.PI / 6));
  context.closePath(); context.fillStyle = tint; context.fill();
}

function diagonalArrowPoints(segment, side, selected) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy);
  if (length < .01) return null;
  const width = selected ? 5 : 3;
  const halfWidth = width / 2;
  const tangent = { x: dx / length, y: dy / length };
  const normal = { x: -dy / length, y: dx / length };
  const direction = side === 'minimum' ? 1 : -1;
  const outward = { x: normal.x * direction, y: normal.y * direction };
  const startInside = {
    x: segment.x1 - outward.x * halfWidth,
    y: segment.y1 - outward.y * halfWidth,
  };
  const startOutside = {
    x: segment.x1 + outward.x * halfWidth,
    y: segment.y1 + outward.y * halfWidth,
  };
  if (!segment.trueEnd) {
    return [
      startInside,
      {
        x: segment.x2 - outward.x * halfWidth,
        y: segment.y2 - outward.y * halfWidth,
      },
      {
        x: segment.x2 + outward.x * halfWidth,
        y: segment.y2 + outward.y * halfWidth,
      },
      startOutside,
    ];
  }

  const longitudinalSize = Math.min(selected ? 24 : 21, length * .72);
  const rear = {
    x: segment.x2 - tangent.x * longitudinalSize,
    y: segment.y2 - tangent.y * longitudinalSize,
  };
  const segmentTop = Math.max(0, Math.min(segment.y1, segment.y2));
  const segmentBottom = Math.max(segment.y1, segment.y2);
  const verticalRoom = outward.y < 0 ? rear.y - segmentTop : segmentBottom - rear.y;
  const exteriorRoom = Math.max(
    0,
    verticalRoom / Math.max(Math.abs(outward.y), Number.EPSILON),
  );
  const rearHalfWidth = Math.min(halfWidth, exteriorRoom);
  const outwardSize = Math.min(
    selected ? 10 : 9,
    longitudinalSize * .6,
    exteriorRoom,
  );
  return [
    startInside,
    {
      x: rear.x - outward.x * rearHalfWidth,
      y: rear.y - outward.y * rearHalfWidth,
    },
    { x: segment.x2, y: segment.y2 },
    {
      x: rear.x + outward.x * Math.max(rearHalfWidth, outwardSize),
      y: rear.y + outward.y * Math.max(rearHalfWidth, outwardSize),
    },
    {
      x: rear.x + outward.x * rearHalfWidth,
      y: rear.y + outward.y * rearHalfWidth,
    },
    startOutside,
  ];
}

function traceDiagonalArrow(context, points) {
  if (!points) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

function drawDiagonalArrow(context, points, tint) {
  if (!points) return;
  context.save();
  context.fillStyle = tint;
  traceDiagonalArrow(context, points);
  context.fill();
  context.restore();
}

function summaryColor(rawWeight, absolute, colorOptions) {
  const weight = Math.max(-absolute, Math.min(absolute, rawWeight));
  const dissonance = absolute === 0 ? 0 : Math.max(0, Math.min(1, 1 - Math.abs(weight) / absolute));
  return color({
    netWeightDecibans: weight,
    absoluteWeightDecibans: absolute,
    dissonance,
  }, colorOptions);
}

function rgbFromHex(tint, cache) {
  const existing = cache.get(tint);
  if (existing) return existing;
  const rgb = [1, 3, 5].map((index) => Number.parseInt(tint.slice(index, index + 2), 16));
  cache.set(tint, rgb);
  return rgb;
}

function maskReferences(geometry) {
  if (geometry.totalWeight > 0) return [{ prior: geometry.minPriorDecibans, blendWeight: 1 }];
  if (geometry.totalWeight < 0) return [{ prior: geometry.maxPriorDecibans, blendWeight: 1 }];
  if (geometry.minPriorDecibans === geometry.maxPriorDecibans) {
    return [{ prior: geometry.minPriorDecibans, blendWeight: 1 }];
  }
  return [
    { prior: geometry.minPriorDecibans, blendWeight: .5 },
    { prior: geometry.maxPriorDecibans, blendWeight: .5 },
  ];
}

function prepareBackground(width, height) {
  if (!backgroundCanvas) {
    backgroundCanvas = document.createElement('canvas');
    backgroundContext = backgroundCanvas.getContext('2d');
  }
  if (!backgroundImage || backgroundCanvas.width !== width || backgroundCanvas.height !== height) {
    backgroundCanvas.width = width;
    backgroundCanvas.height = height;
    backgroundImage = backgroundContext.createImageData(width, height);
  }
  return { canvas: backgroundCanvas, context: backgroundContext, image: backgroundImage };
}

function colorSignature(options) {
  return [
    options.minPriorDecibans,
    options.maxPriorDecibans,
    options.saturationThresholdDecibans,
    options.anchors?.gray,
    options.anchors?.yellow,
    options.anchors?.red,
    options.anchors?.green,
  ].join('|');
}

function drawBackground(context, data) {
  const { geometry, viewportHeight, viewportWidth, horizontalPixelsPerDeciban, colorOptions } = data;
  const amplitude = geometry.maximum - geometry.minimum;
  const tickStep = geometry.totalAbsolute > amplitude ? 4 : 2;
  const backgroundWidth = Math.max(1, Math.ceil(viewportWidth / tickStep));
  const backgroundHeight = Math.max(1, Math.ceil(viewportHeight / tickStep));
  const background = prepareBackground(backgroundWidth, backgroundHeight);
  const backgroundKey = {
    geometry,
    viewportWidth,
    viewportHeight,
    tickStep,
    color: colorSignature(colorOptions),
  };
  const reusable = lastBackground
    && Object.keys(backgroundKey).every((key) => lastBackground[key] === backgroundKey[key]);

  if (!reusable) {
    const references = maskReferences(geometry);
    const rgbCache = new Map();
    const columns = Array.from({ length: backgroundWidth }, (_, column) => {
      const x = Math.min(viewportWidth, (column + .5) * tickStep);
      const posterior = geometry.minimum + x / horizontalPixelsPerDeciban;
      return {
        references: references.map(({ prior, blendWeight }) => ({
          weight: posterior - prior,
          blendWeight,
        })),
      };
    });

    for (let row = 0; row < backgroundHeight; row += 1) {
      const y = Math.min(viewportHeight, (row + .5) * tickStep);
      const geometryY = y;
      const absolute = geometryY > geometry.totalHeight
        ? null
        : absoluteFromY(geometry, geometryY);
      for (let column = 0; column < backgroundWidth; column += 1) {
        const index = (row * backgroundWidth + column) * 4;
        const rgb = [...NEUTRAL_RGB];
        const currentColumn = columns[column];
        if (absolute !== null) {
          const sum = [0, 0, 0];
          for (const { weight, blendWeight } of currentColumn.references) {
            const tint = summaryColor(weight, absolute, colorOptions);
            const components = rgbFromHex(tint, rgbCache);
            for (let channel = 0; channel < 3; channel += 1) sum[channel] += components[channel] * blendWeight;
          }
          for (let channel = 0; channel < 3; channel += 1) rgb[channel] = Math.round(sum[channel]);
        }
        background.image.data[index] = rgb[0];
        background.image.data[index + 1] = rgb[1];
        background.image.data[index + 2] = rgb[2];
        background.image.data[index + 3] = 255;
      }
    }
    background.context.putImageData(background.image, 0, 0);
    lastBackground = backgroundKey;
  }
  context.save();
  context.beginPath();
  for (const section of geometry.sections) {
    const minimumStart = (geometry.minPriorDecibans - section.startAbsolute - geometry.minimum) * horizontalPixelsPerDeciban;
    const maximumStart = (geometry.maxPriorDecibans + section.startAbsolute - geometry.minimum) * horizontalPixelsPerDeciban;
    const minimumEnd = (geometry.minPriorDecibans - section.endAbsolute - geometry.minimum) * horizontalPixelsPerDeciban;
    const maximumEnd = (geometry.maxPriorDecibans + section.endAbsolute - geometry.minimum) * horizontalPixelsPerDeciban;
    context.moveTo(minimumStart, section.yStart);
    context.lineTo(maximumStart, section.yStart);
    context.lineTo(maximumEnd, section.yEnd);
    context.lineTo(minimumEnd, section.yEnd);
    context.closePath();
  }
  context.clip();
  context.imageSmoothingEnabled = true;
  context.globalAlpha = .5;
  context.drawImage(background.canvas, 0, 0, backgroundWidth, backgroundHeight, 0, 0, viewportWidth, viewportHeight);
  context.restore();

  return { ...background, width: backgroundWidth, height: backgroundHeight };
}

function drawBreak(context, breakItem, viewportWidth, selectedEvidenceId, i18n) {
  const y = breakItem.y;
  if (y + breakItem.height < 0) return;
  const selection = breakItem.hiddenEvidenceIds.includes(selectedEvidenceId);
  context.fillStyle = selection ? '#dbeafe' : '#e2e8f0'; context.fillRect(0, y, viewportWidth, breakItem.height);
  const line1 = i18n.t('canvas.breakLine', {
    side: i18n.t(`side.${breakItem.side}`), gap: numberText(breakItem.absoluteGap, i18n),
  });
  const line2 = i18n.t('canvas.breakEvidence', {
    end: numberText(breakItem.endAbsolute, i18n),
    start: numberText(breakItem.startAbsolute, i18n),
    count: breakItem.hiddenEvidenceIds.length,
  });
  context.font = '800 13px system-ui';
  const large = Math.min(viewportWidth - 12, Math.max(context.measureText(line1).width, context.measureText(line2).width) + 16);
  context.fillStyle = selection ? '#dbeafe' : '#f8fafc'; context.fillRect(6, y + 3, large, breakItem.height - 6);
  context.fillStyle = selection ? '#1e3a8a' : '#334155'; context.fillText(line1, 10, y + 17);
  context.font = '700 12px system-ui'; context.fillText(line2, 10, y + 32);
}

function drawProbabilityAxis(context, data, { position, endpoints }) {
  const { geometry, viewportWidth, horizontalPixelsPerDeciban, i18n } = data;
  const endpointLabels = new Map(endpoints.map(({ weight, label }) => [weight, label]));
  const first = Math.ceil(geometry.minimum / 5);
  const last = Math.floor(geometry.maximum / 5);
  const tickCount = Math.max(0, last - first + 1);
  const maxTicks = Math.max(1, Math.ceil(viewportWidth / 3) + 4);
  const tickStep = Math.max(1, Math.ceil(tickCount / maxTicks));
  const ticks = new Set([geometry.minimum, geometry.maximum, 0]);
  for (const endpoint of endpoints) ticks.add(endpoint.weight);
  for (let index = 0; index < tickCount; index += tickStep) {
    const value = (first + index) * 5;
    if (!Number.isFinite(value)) break;
    ticks.add(value);
  }
  if (tickCount) ticks.add(last * 5);
  const values = [...ticks].filter((x) => Number.isFinite(x) && x >= geometry.minimum && x <= geometry.maximum).sort((a, b) => a - b);
  const atBottom = position === 'bottom';
  const y = atBottom ? RULER_HEIGHT - .5 : .5;
  const tickEnd = y + (atBottom ? -3 : 3);
  const labelBaseline = atBottom ? 16 : 22;
  context.save(); context.strokeStyle = '#64748b'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, y); context.lineTo(viewportWidth, y); context.stroke();
  for (const weight of values) {
    const x = (weight - geometry.minimum) * horizontalPixelsPerDeciban;
    context.beginPath(); context.moveTo(x, y); context.lineTo(x, tickEnd); context.stroke();
  }
  context.font = '700 12px system-ui';
  context.textBaseline = 'alphabetic';
  const placements = [];
  const priorities = [0, ...endpoints.map(({ weight }) => weight), geometry.minimum, geometry.maximum];
  const ordered = [...new Set([...priorities, ...values])];
  for (const weight of ordered) {
    if (!Number.isFinite(weight) || weight < geometry.minimum || weight > geometry.maximum) continue;
    const x = (weight - geometry.minimum) * horizontalPixelsPerDeciban;
    const text = endpointLabels.get(weight) ?? percentageText(weight, i18n);
    const width = context.measureText(text).width;
    const left = Math.max(1, Math.min(viewportWidth - width - 1, x - width / 2));
    if (placements.some(([a, b]) => left <= b + 5 && left + width >= a - 5)) continue;
    context.fillStyle = 'rgb(248 250 252 / 92%)'; context.fillRect(left - 2, labelBaseline - 13, width + 4, 17);
    context.fillStyle = '#526478'; context.fillText(text, left, labelBaseline);
    placements.push([left, left + width]);
  }
  context.restore();
}

function drawResultant(context, data, y) {
  const { geometry, viewportWidth, horizontalPixelsPerDeciban, latestColor } = data;
  if (geometry.totalWeight === 0) return;
  const prior = geometry.totalWeight > 0 ? geometry.minPriorDecibans : geometry.maxPriorDecibans;
  const rawStart = (prior - geometry.minimum) * horizontalPixelsPerDeciban;
  const rawEnd = (prior + geometry.totalWeight - geometry.minimum) * horizontalPixelsPerDeciban;
  if ((rawStart < 0 && rawEnd < 0) || (rawStart > viewportWidth && rawEnd > viewportWidth)) return;
  const start = Math.max(0, Math.min(viewportWidth, rawStart)); const end = Math.max(0, Math.min(viewportWidth, rawEnd));
  const direction = Math.sign(end - start); const length = Math.abs(end - start);
  if (!direction || length < .01) return;
  const arrowheadVisible = rawEnd >= 0 && rawEnd <= viewportWidth;
  const arrowhead = Math.min(18, length, Math.max(5, length * .55));
  const lineEnd = arrowheadVisible ? end - direction * arrowhead * .82 : end;
  context.save(); context.fillStyle = latestColor;
  context.fillRect(Math.min(start, lineEnd), y - 4, Math.abs(lineEnd - start), 8);
  if (arrowheadVisible) { context.beginPath(); context.moveTo(end, y); context.lineTo(end - direction * arrowhead, y - arrowhead / 2); context.lineTo(end - direction * arrowhead, y + arrowhead / 2); context.closePath(); context.fill(); }
  context.restore();
}

function ribbonPath(context, ribbon) {
  context.beginPath();
  context.moveTo(ribbon.xMinimum1, ribbon.y1);
  context.lineTo(ribbon.xMaximum1, ribbon.y1);
  context.lineTo(ribbon.xMaximum2, ribbon.y2);
  context.lineTo(ribbon.xMinimum2, ribbon.y2);
  context.closePath();
}

function strokeRibbon(context, ribbon, exactPrior, selected) {
  context.save();
  context.lineJoin = 'round';
  if (exactPrior) {
    if (!selected) { context.restore(); return; }
    context.lineCap = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(ribbon.xMinimum1, ribbon.y1);
    context.lineTo(ribbon.xMinimum2, ribbon.y2);
    context.stroke();
  } else {
    ribbonPath(context, ribbon);
    context.strokeStyle = selected ? '#0f172a' : 'rgb(15 23 42 / 35%)';
    context.lineWidth = selected ? 3 : 1;
    context.stroke();
  }
  context.restore();
}

function drawZeroPoint(
  context,
  ribbon,
  tint,
  selected,
  viewportWidth,
  viewportHeight,
) {
  const y = ribbon.y1;
  if (y < -8 || y > viewportHeight + 8) return;
  const radius = selected ? 6 : 4;
  const left = Math.max(0, Math.min(ribbon.xMinimum1, ribbon.xMaximum1));
  const right = Math.min(viewportWidth, Math.max(ribbon.xMinimum1, ribbon.xMaximum1));
  if (left > right) return;
  const x = Math.max(0, Math.min(viewportWidth, (left + right) / 2));
  context.save();
  context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = tint; context.fill();
  context.strokeStyle = '#0f172a'; context.lineWidth = selected ? 2.5 : 1.5; context.stroke();
  context.restore();
}

function drawExactPrior(context, ribbon, data) {
  const { viewportHeight, colorOptions } = data;
  const yDelta = ribbon.y2 - ribbon.y1;
  const minimumY = Math.max(0, Math.ceil(Math.min(ribbon.y1, ribbon.y2) - 1));
  const maximumY = Math.min(
    Math.ceil(viewportHeight),
    Math.floor(Math.max(ribbon.y1, ribbon.y2) + 1),
  );
  if (minimumY > maximumY) return;

  for (let y = minimumY; y <= maximumY; y += 1) {
    const t = yDelta === 0
      ? .5
      : Math.max(0, Math.min(1, (y - ribbon.y1) / yDelta));
    const weight = ribbon.startWeight + (ribbon.endWeight - ribbon.startWeight) * t;
    const absolute = ribbon.startAbsolute + (ribbon.endAbsolute - ribbon.startAbsolute) * t;
    const left = ribbon.xMinimum1 + (ribbon.xMinimum2 - ribbon.xMinimum1) * t;
    context.fillStyle = summaryColor(weight, absolute, colorOptions);
    context.fillRect(left - 1.5, y - .75, 3, 1.5);
  }
}

function fillRibbon(context, ribbon, viewportWidth, viewportHeight, background) {
  context.save();
  ribbonPath(context, ribbon);
  context.clip();
  context.imageSmoothingEnabled = true;
  context.drawImage(background.canvas, 0, 0, background.width, background.height, 0, 0, viewportWidth, viewportHeight);
  context.restore();
}

function drawRibbons(context, data, background) {
  const {
    geometry, evidence, selectedEvidenceId, colorOptions, viewportWidth, viewportHeight,
  } = data;
  const byId = new Map(geometry.steps.map((step) => [step.id, step]));
  const exactPrior = geometry.minPriorDecibans === geometry.maxPriorDecibans;
  const arrows = [];
  for (const item of evidence) {
    const step = byId.get(item.id); const ribbon = step?.visibleRibbon;
    if (!ribbon) continue;
    const selected = item.id === selectedEvidenceId;
    if (step.weightDecibans !== 0) {
      if (!exactPrior) fillRibbon(context, ribbon, viewportWidth, viewportHeight, background);
      strokeRibbon(context, ribbon, exactPrior, selected);
      if (exactPrior) drawExactPrior(context, ribbon, data);
    }

    if (step.weightDecibans === 0) {
      drawZeroPoint(
        context,
        ribbon,
        summaryColor(ribbon.endWeight, ribbon.endAbsolute, colorOptions),
        selected,
        viewportWidth,
        viewportHeight,
      );
    }
    for (const edge of step.edgeSegments) {
      const segment = edge;
      if ((segment.y1 < -30 && segment.y2 < -30) || (segment.y1 > viewportHeight + 30 && segment.y2 > viewportHeight + 30)) continue;
      if (exactPrior) {
        context.save();
        drawArrowhead(
          context,
          segment,
          summaryColor(step.end.weight, step.end.absolute, colorOptions),
          selected,
        );
        context.restore();
      } else {
        const tint = item.direction === 'for' ? '#15803d' : '#dc2626';
        arrows.push({
          tint,
          points: diagonalArrowPoints(segment, edge.side, selected),
        });
      }
    }
  }
  for (const arrow of arrows) drawDiagonalArrow(context, arrow.points, arrow.tint);
}

function absoluteTickStep(verticalPixelsPerDeciban) {
  const minimumSpacing = 18;
  const minimumStep = minimumSpacing / verticalPixelsPerDeciban;
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  for (const factor of [1, 2, 5, 10]) {
    const step = factor * magnitude;
    if (step >= minimumStep) return step;
  }
  return 10 * magnitude;
}

function visibleAbsoluteTicks(geometry, tickStep) {
  const ticks = new Map();
  for (const section of geometry.sections) {
    const first = Math.ceil(
      (section.startAbsolute - Number.EPSILON * Math.max(1, section.startAbsolute)) / tickStep,
    );
    const last = Math.floor(
      (section.endAbsolute + Number.EPSILON * Math.max(1, section.endAbsolute)) / tickStep,
    );
    for (let index = Math.max(0, first); index <= last; index += 1) {
      const absolute = index * tickStep;
      ticks.set(absolute.toPrecision(14), absolute);
    }
  }
  return [...ticks.values()].sort((a, b) => a - b);
}

function drawAbsoluteScale(context, geometry, viewportHeight, i18n) {
  const tickStep = absoluteTickStep(geometry.verticalPixelsPerDeciban);
  context.save();
  context.font = '700 12px system-ui';
  context.textBaseline = 'middle';
  context.strokeStyle = 'rgb(51 65 85 / 75%)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(3, 0);
  context.lineTo(3, Math.min(viewportHeight, geometry.totalHeight));
  context.stroke();
  for (const absolute of visibleAbsoluteTicks(geometry, tickStep)) {
    const y = positionAbsolute(geometry, absolute);
    if (y < 0 || y > viewportHeight) continue;
    context.beginPath(); context.moveTo(3, y); context.lineTo(9, y); context.stroke();
    if (y < 18 || y > viewportHeight - 7) continue;
    const text = numberText(absolute, i18n);
    const width = context.measureText(text).width;
    context.fillStyle = 'rgb(248 250 252 / 88%)';
    context.fillRect(10, y - 7, width + 5, 14);
    context.fillStyle = '#334155';
    context.fillText(text, 12, y);
  }
  context.restore();
}

function drawZeroOrigin(context, data, height = data.viewportHeight) {
  const { geometry, horizontalPixelsPerDeciban } = data;
  if (geometry.minimum > 0 || geometry.maximum < 0) return;
  const x = (0 - geometry.minimum) * horizontalPixelsPerDeciban;
  context.save();
  context.strokeStyle = 'rgb(15 23 42 / 48%)';
  context.lineWidth = 1;
  context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  context.restore();
}

function drawEndpointGuides(context, data) {
  const { geometry, viewportWidth, viewportHeight, horizontalPixelsPerDeciban } = data;
  context.save();
  context.strokeStyle = 'rgb(15 23 42 / 38%)';
  context.lineWidth = 1;
  context.setLineDash([3, 3]);
  for (const prior of new Set([geometry.minPriorDecibans, geometry.maxPriorDecibans])) {
    const x = (prior - geometry.minimum) * horizontalPixelsPerDeciban;
    if (x < 0 || x > viewportWidth) continue;
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, viewportHeight); context.stroke();
  }
  const posteriorTop = Math.max(0, viewportHeight - 28);
  if (geometry.currentInterval.visible) {
    for (const posterior of new Set([
      geometry.currentInterval.minimum,
      geometry.currentInterval.maximum,
    ])) {
      const x = (posterior - geometry.minimum) * horizontalPixelsPerDeciban;
      if (x < 0 || x > viewportWidth) continue;
      context.beginPath(); context.moveTo(x, posteriorTop); context.lineTo(x, viewportHeight); context.stroke();
    }
  }
  context.restore();
}

export function drawDiagram(data) {
  const {
    canvas,
    context,
    rulerCanvas,
    rulerContext,
    posteriorRulerCanvas,
    posteriorRulerContext,
    priorResultantCanvas,
    priorResultantContext,
    viewportWidth,
    viewportHeight,
    geometry,
    selectedEvidenceId,
    priorRulerEndpoints,
    posteriorRulerEndpoints,
  } = data;
  resizeCanvas(canvas, context, viewportWidth, viewportHeight);
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  const background = drawBackground(context, data);
  for (const breakItem of geometry.breaks) drawBreak(context, breakItem, viewportWidth, selectedEvidenceId, data.i18n);
  drawRibbons(context, data, background);
  drawEndpointGuides(context, data);
  drawZeroOrigin(context, data);
  drawAbsoluteScale(context, geometry, viewportHeight, data.i18n);
  resizeCanvas(rulerCanvas, rulerContext, viewportWidth, RULER_HEIGHT);
  rulerContext.clearRect(0, 0, viewportWidth, RULER_HEIGHT);
  drawZeroOrigin(rulerContext, data, RULER_HEIGHT);
  drawProbabilityAxis(rulerContext, data, {
    position: 'bottom',
    endpoints: priorRulerEndpoints,
  });
  resizeCanvas(posteriorRulerCanvas, posteriorRulerContext, viewportWidth, RULER_HEIGHT);
  posteriorRulerContext.clearRect(0, 0, viewportWidth, RULER_HEIGHT);
  drawZeroOrigin(posteriorRulerContext, data, RULER_HEIGHT);
  drawProbabilityAxis(posteriorRulerContext, data, {
    position: 'top',
    endpoints: posteriorRulerEndpoints,
  });
  resizeCanvas(priorResultantCanvas, priorResultantContext, viewportWidth, 30);
  priorResultantContext.clearRect(0, 0, viewportWidth, 30);
  drawResultant(priorResultantContext, data, 15);
}
