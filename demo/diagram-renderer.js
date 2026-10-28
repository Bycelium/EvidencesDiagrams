import { color, decibansToProbability } from '../dist/index.js';
import { absoluteFromY, positionAbsolute } from './geometry.js';

const NEUTRAL_RGB = [248, 250, 252];
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
function signedText(value, i18n) { return `${value > 0 ? '+' : value < 0 ? '−' : ''}${numberText(Math.abs(value), i18n)}`; }
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
  const size = Math.min(selected ? 14 : 11, length * .45);
  const angle = Math.atan2(dy, dx);
  context.beginPath(); context.moveTo(segment.x2, segment.y2);
  context.lineTo(segment.x2 - size * Math.cos(angle - Math.PI / 6), segment.y2 - size * Math.sin(angle - Math.PI / 6));
  context.lineTo(segment.x2 - size * Math.cos(angle + Math.PI / 6), segment.y2 - size * Math.sin(angle + Math.PI / 6));
  context.closePath(); context.fillStyle = tint; context.fill();
}

function drawArrow(context, segment, tint, selected) {
  const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
  if (length < .01) return;
  const width = selected ? 5 : 3;
  context.save();
  context.lineCap = 'round';
  context.strokeStyle = '#fff'; context.lineWidth = width + 3;
  context.beginPath(); context.moveTo(segment.x1, segment.y1); context.lineTo(segment.x2, segment.y2); context.stroke();
  context.strokeStyle = tint; context.lineWidth = width;
  context.beginPath(); context.moveTo(segment.x1, segment.y1); context.lineTo(segment.x2, segment.y2); context.stroke();
  drawArrowhead(context, segment, tint, selected);
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

function drawBackground(context, data, yOffset) {
  const { geometry, viewportHeight, viewportWidth, pixelsPerDeciban, colorOptions, priors } = data;
  const amplitude = geometry.maximum - geometry.minimum;
  const tickStep = geometry.totalAbsolute > amplitude ? 4 : 2;
  const backgroundWidth = Math.max(1, Math.ceil(viewportWidth / tickStep));
  const backgroundHeight = Math.max(1, Math.ceil(viewportHeight / tickStep));
  const background = prepareBackground(backgroundWidth, backgroundHeight);
  const backgroundKey = {
    geometry,
    yOffset,
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
      const posterior = geometry.minimum + x / pixelsPerDeciban;
      return {
        posterior,
        references: references.map(({ prior, blendWeight }) => ({
          weight: posterior - prior,
          blendWeight,
        })),
      };
    });

    for (let row = 0; row < backgroundHeight; row += 1) {
      const y = Math.min(viewportHeight, (row + .5) * tickStep);
      const geometryY = y + yOffset;
      const absolute = geometryY > geometry.totalHeight
        ? null
        : absoluteFromY(geometry, geometryY);
      for (let column = 0; column < backgroundWidth; column += 1) {
        const index = (row * backgroundWidth + column) * 4;
        const rgb = [...NEUTRAL_RGB];
        const currentColumn = columns[column];
        const insideEnvelope = absolute !== null
          && currentColumn.posterior >= geometry.minPriorDecibans - absolute
          && currentColumn.posterior <= geometry.maxPriorDecibans + absolute;
        if (insideEnvelope) {
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
  context.imageSmoothingEnabled = false;
  context.drawImage(background.canvas, 0, 0, backgroundWidth, backgroundHeight, 0, 0, viewportWidth, viewportHeight);
  context.restore();

  const visibleHeight = Math.max(0, Math.min(viewportHeight, geometry.totalHeight - yOffset));
  context.save(); context.strokeStyle = 'rgb(15 23 42 / 55%)'; context.lineWidth = 1; context.setLineDash([3, 3]);
  for (const prior of new Set([priors.minPriorDecibans, priors.maxPriorDecibans])) {
    const x = (prior - geometry.minimum) * pixelsPerDeciban;
    if (x >= 0 && x <= viewportWidth) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, visibleHeight); context.stroke(); }
  }
  context.restore();
}

function drawBreak(context, breakItem, yOffset, viewportWidth, selectedEvidenceId, i18n) {
  const y = breakItem.y - yOffset;
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

function drawAxis(context, data, showLabels) {
  const { geometry, viewportWidth, pixelsPerDeciban, latestColor, i18n } = data;
  const active = geometry.totalWeight === 0
    ? null
    : geometry.totalWeight > 0 ? geometry.minPriorDecibans : geometry.maxPriorDecibans;
  const first = Math.ceil(geometry.minimum / 5);
  const last = Math.floor(geometry.maximum / 5);
  const tickCount = Math.max(0, last - first + 1);
  const maxTicks = Math.max(1, Math.ceil(viewportWidth / 3) + 4);
  const tickStep = Math.max(1, Math.ceil(tickCount / maxTicks));
  const ticks = new Set([geometry.minimum, geometry.maximum, 0]);
  if (active !== null) ticks.add(active);
  for (let index = 0; index < tickCount; index += tickStep) {
    const value = (first + index) * 5;
    if (!Number.isFinite(value)) break;
    ticks.add(value);
  }
  if (tickCount) ticks.add(last * 5);
  const values = [...ticks].filter((x) => Number.isFinite(x) && x >= geometry.minimum && x <= geometry.maximum).sort((a, b) => a - b);
  const y = showLabels ? 48 : 0;
  context.save(); context.strokeStyle = '#64748b'; context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, y); context.lineTo(viewportWidth, y); context.stroke();
  context.font = '700 12px system-ui'; const placements = [];
  const priorities = active === null
    ? [0, geometry.minimum, geometry.maximum]
    : [active, 0, geometry.minimum, geometry.maximum];
  const ordered = [...new Set([...priorities, ...values])];
  for (const posterior of ordered) {
    const x = (posterior - geometry.minimum) * pixelsPerDeciban;
    context.beginPath(); context.moveTo(x, y - (showLabels ? 3 : 0)); context.lineTo(x, y + (showLabels ? 0 : 6)); context.stroke();
    if (!showLabels) continue;
    const topText = percentageText(posterior, i18n);
    const bottomText = active === null ? null : signedText(posterior - active, i18n);
    const width = Math.max(context.measureText(topText).width, bottomText === null ? 0 : context.measureText(bottomText).width);
    const left = Math.max(1, Math.min(viewportWidth - width - 1, x - width / 2));
    if (placements.some(([a, b]) => left <= b + 5 && left + width >= a - 5)) continue;
    context.fillStyle = 'rgb(248 250 252 / 92%)'; context.fillRect(left - 2, 3, width + 4, 31);
    context.fillStyle = '#526478'; context.fillText(topText, left + (width - context.measureText(topText).width) / 2, 15);
    if (bottomText !== null) {
      context.fillStyle = posterior === active ? latestColor : '#334155';
      context.fillText(bottomText, left + (width - context.measureText(bottomText).width) / 2, 30);
    }
    placements.push([left, left + width]);
  }
  context.restore();
}

function drawResultant(context, data, y) {
  const { geometry, viewportWidth, pixelsPerDeciban, latestColor } = data;
  if (geometry.totalWeight === 0) return;
  const prior = geometry.totalWeight > 0 ? geometry.minPriorDecibans : geometry.maxPriorDecibans;
  const rawStart = (prior - geometry.minimum) * pixelsPerDeciban;
  const rawEnd = (prior + geometry.totalWeight - geometry.minimum) * pixelsPerDeciban;
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

function ribbonPath(context, ribbon, yOffset) {
  context.beginPath();
  context.moveTo(ribbon.xMinimum1, ribbon.y1 - yOffset);
  context.lineTo(ribbon.xMaximum1, ribbon.y1 - yOffset);
  context.lineTo(ribbon.xMaximum2, ribbon.y2 - yOffset);
  context.lineTo(ribbon.xMinimum2, ribbon.y2 - yOffset);
  context.closePath();
}

function strokeRibbon(context, ribbon, yOffset, exactPrior, selected) {
  context.save();
  context.lineJoin = 'round';
  if (exactPrior) {
    if (!selected) { context.restore(); return; }
    context.lineCap = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(ribbon.xMinimum1, ribbon.y1 - yOffset);
    context.lineTo(ribbon.xMinimum2, ribbon.y2 - yOffset);
    context.stroke();
  } else {
    ribbonPath(context, ribbon, yOffset);
    context.strokeStyle = selected ? '#0f172a' : 'rgb(15 23 42 / 35%)';
    context.lineWidth = selected ? 3 : 1;
    context.stroke();
  }
  context.restore();
}

function drawZeroPoint(
  context,
  ribbon,
  yOffset,
  tint,
  selected,
  viewportWidth,
  viewportHeight,
) {
  const y = ribbon.y1 - yOffset;
  if (y < -8 || y > viewportHeight + 8) return;
  const radius = selected ? 6 : 4;
  const left = Math.max(0, Math.min(ribbon.xMinimum1, ribbon.xMaximum1));
  const right = Math.min(viewportWidth, Math.max(ribbon.xMinimum1, ribbon.xMaximum1));
  if (left > right) return;
  const x = Math.max(0, Math.min(viewportWidth, (left + right) / 2));
  context.save();
  context.beginPath(); context.arc(x, y, radius + 2, 0, Math.PI * 2);
  context.fillStyle = '#fff'; context.fill();
  context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = tint; context.fill();
  context.strokeStyle = '#0f172a'; context.lineWidth = selected ? 2.5 : 1.5; context.stroke();
  context.restore();
}

function drawExactPrior(context, ribbon, data, yOffset) {
  const { viewportHeight, colorOptions } = data;
  const yDelta = ribbon.y2 - ribbon.y1;
  const minimumY = Math.max(0, Math.ceil(Math.min(ribbon.y1, ribbon.y2) - yOffset - 1));
  const maximumY = Math.min(
    Math.ceil(viewportHeight),
    Math.floor(Math.max(ribbon.y1, ribbon.y2) - yOffset + 1),
  );
  if (minimumY > maximumY) return;

  for (let y = minimumY; y <= maximumY; y += 1) {
    const t = yDelta === 0
      ? .5
      : Math.max(0, Math.min(1, (y + yOffset - ribbon.y1) / yDelta));
    const weight = ribbon.startWeight + (ribbon.endWeight - ribbon.startWeight) * t;
    const absolute = ribbon.startAbsolute + (ribbon.endAbsolute - ribbon.startAbsolute) * t;
    const left = ribbon.xMinimum1 + (ribbon.xMinimum2 - ribbon.xMinimum1) * t;
    context.fillStyle = summaryColor(weight, absolute, colorOptions);
    context.fillRect(left - 1.5, y - .75, 3, 1.5);
  }
}

function drawRibbons(context, data, yOffset) {
  const {
    geometry, evidence, selectedEvidenceId, colorOptions, viewportWidth, viewportHeight,
  } = data;
  const byId = new Map(geometry.steps.map((step) => [step.id, step]));
  const exactPrior = geometry.minPriorDecibans === geometry.maxPriorDecibans;
  for (const item of evidence) {
    const step = byId.get(item.id); const ribbon = step?.visibleRibbon;
    if (!ribbon) continue;
    const selected = item.id === selectedEvidenceId;
    if (step.weightDecibans !== 0) {
      strokeRibbon(context, ribbon, yOffset, exactPrior, selected);
      if (exactPrior) drawExactPrior(context, ribbon, data, yOffset);
    }

    if (step.weightDecibans === 0) {
      drawZeroPoint(
        context,
        ribbon,
        yOffset,
        summaryColor(ribbon.endWeight, ribbon.endAbsolute, colorOptions),
        selected,
        viewportWidth,
        viewportHeight,
      );
    }
    for (const edge of step.edgeSegments) {
      const segment = { ...edge, y1: edge.y1 - yOffset, y2: edge.y2 - yOffset };
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
        drawArrow(context, segment, tint, selected);
      }
    }
  }
}

function drawAbsoluteScale(context, geometry, yOffset, viewportHeight, i18n) {
  const tickStep = geometry.totalAbsolute <= 20 ? 5 : geometry.totalAbsolute <= 60 ? 10 : 25;
  context.save();
  context.font = '700 12px system-ui';
  context.textBaseline = 'alphabetic';
  for (let absolute = 0; absolute <= geometry.totalAbsolute + .001; absolute += tickStep) {
    if (geometry.breaks.some((breakItem) => (
      absolute > breakItem.startAbsolute && absolute < breakItem.endAbsolute
    ))) continue;
    const y = positionAbsolute(geometry, absolute) - yOffset;
    if (y < 0 || y > viewportHeight) continue;
    const text = numberText(absolute, i18n);
    const width = context.measureText(text).width;
    const row = Math.max(13, Math.min(viewportHeight - 2, y - 4));
    context.fillStyle = 'rgb(248 250 252 / 88%)';
    context.fillRect(5, row - 12, width + 6, 15);
    context.fillStyle = '#334155';
    context.fillText(text, 8, row);
  }
  context.restore();
}

export function drawDiagram(data) {
  const { canvas, context, rulerCanvas, rulerContext, priorResultantCanvas, priorResultantContext, viewportWidth, viewportHeight, yOffset, geometry, selectedEvidenceId } = data;
  resizeCanvas(canvas, context, viewportWidth, viewportHeight);
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  drawBackground(context, data, yOffset);
  for (const breakItem of geometry.breaks) drawBreak(context, breakItem, yOffset, viewportWidth, selectedEvidenceId, data.i18n);
  drawRibbons(context, data, yOffset);
  drawAbsoluteScale(context, geometry, yOffset, viewportHeight, data.i18n);
  const interval = geometry.currentInterval;
  if (interval.visible) {
    context.save(); context.strokeStyle = '#0f172a'; context.lineWidth = 3;
    context.beginPath(); context.moveTo(Math.max(0, Math.min(viewportWidth, (interval.minimum - geometry.minimum) * data.pixelsPerDeciban)), 0); context.lineTo(Math.max(0, Math.min(viewportWidth, (interval.maximum - geometry.minimum) * data.pixelsPerDeciban)), 0); context.stroke(); context.restore();
  }
  drawAxis(context, data, false); drawResultant(context, data, 0);
  resizeCanvas(rulerCanvas, rulerContext, viewportWidth, 48);
  rulerContext.clearRect(0, 0, viewportWidth, 48); drawAxis(rulerContext, data, true); drawResultant(rulerContext, data, 48);
  resizeCanvas(priorResultantCanvas, priorResultantContext, viewportWidth, 30);
  priorResultantContext.clearRect(0, 0, viewportWidth, 30);
  drawResultant(priorResultantContext, data, 15);
}
