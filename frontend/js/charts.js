/* Lightweight SVG charts (no dependencies): line, donut, and bar.
 *
 * Every chart renders accessible markup with a text summary so the data is
 * understandable without colour vision. Charts resize with the viewport via a
 * responsive viewBox. */

import { escapeHtml } from "./ui.js";

const PALETTE = ["#4E39C2", "#0054CB", "#027A48", "#7F4300", "#BA1A1A", "#6755DC"];

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
  return el;
}

function render(container, svg, summary) {
  container.innerHTML = "";
  svg.classList.add("chart-in");
  container.appendChild(svg);
  const sr = document.createElement("p");
  sr.className = "sr-only";
  sr.textContent = summary;
  container.appendChild(sr);
}

/* ---------------- line chart ---------------- */

/**
 * @param {HTMLElement} container
 * @param {{date:string,count:number}[]} data
 */
export function lineChart(container, data, { height = 220, yLabel = "Applications" } = {}) {
  if (!container) return;
  if (!data || data.length < 2) {
    container.innerHTML =
      '<div class="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-outline-variant text-body-md text-on-surface-variant">Not enough data yet to draw a trend.</div>';
    return;
  }

  const width = 720;
  const pad = { top: 18, right: 18, bottom: 34, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = Math.max(...data.map((d) => d.count), 1);

  const x = (i) => pad.left + (i / (data.length - 1)) * innerW;
  const y = (v) => pad.top + innerH - (v / maxValue) * innerH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "w-full",
    role: "img",
    "aria-label": "Line chart of applications over time",
  });

  // gridlines + y axis labels
  const ticks = 4;
  for (let i = 0; i <= ticks; i += 1) {
    const value = Math.round((maxValue / ticks) * i);
    const yy = y(value);
    svg.appendChild(
      svgEl("line", {
        x1: pad.left, x2: width - pad.right, y1: yy, y2: yy,
        style: "stroke: var(--chart-grid)", "stroke-width": 1,
      })
    );
    const label = svgEl("text", {
      x: pad.left - 8, y: yy + 4, "text-anchor": "end",
      "font-size": 11, style: "fill: var(--chart-label)",
    });
    label.textContent = String(value);
    svg.appendChild(label);
  }

  // area + line
  const points = data.map((d, i) => `${x(i)},${y(d.count)}`);
  svg.appendChild(
    svgEl("polygon", {
      points: `${pad.left},${pad.top + innerH} ${points.join(" ")} ${width - pad.right},${pad.top + innerH}`,
      fill: "#6755DC", opacity: "0.08",
    })
  );
  svg.appendChild(
    svgEl("polyline", {
      points: points.join(" "),
      fill: "none", stroke: "#6755DC", "stroke-width": 2.5,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    })
  );

  // points with tooltips
  data.forEach((d, i) => {
    const circle = svgEl("circle", {
      cx: x(i), cy: y(d.count), r: 3.5, style: "fill: var(--chart-surface)",
      stroke: "#6755DC", "stroke-width": 2,
    });
    const title = svgEl("title");
    title.textContent = `${d.date}: ${d.count} application${d.count === 1 ? "" : "s"}`;
    circle.appendChild(title);
    svg.appendChild(circle);
  });

  // x axis labels (first, middle, last)
  [0, Math.floor(data.length / 2), data.length - 1].forEach((i) => {
    const label = svgEl("text", {
      x: x(i), y: height - 10, "text-anchor": i === 0 ? "start" : i === data.length - 1 ? "end" : "middle",
      "font-size": 11, style: "fill: var(--chart-label)",
    });
    label.textContent = data[i].date.slice(5);
    svg.appendChild(label);
  });

  const total = data.reduce((sum, d) => sum + d.count, 0);
  render(
    container, svg,
    `${yLabel} line chart. ${total} total across ${data.length} days, peak ${maxValue}.`
  );
}

/* ---------------- donut chart ---------------- */

/**
 * @param {HTMLElement} container
 * @param {{label:string,count:number}[]} data
 */
export function donutChart(container, data, { size = 190 } = {}) {
  if (!container) return;
  const items = (data || []).filter((d) => d.count > 0);
  const total = items.reduce((sum, d) => sum + d.count, 0);

  if (!total) {
    container.innerHTML =
      '<div class="flex h-[190px] items-center justify-center rounded-xl border border-dashed border-outline-variant text-body-md text-on-surface-variant">No applications yet.</div>';
    return;
  }

  const stroke = 26;
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${size} ${size}`,
    width: size, height: size,
    role: "img", "aria-label": "Donut chart of application statuses",
    class: "shrink-0",
  });

  let offset = 0;
  items.forEach((item, index) => {
    const fraction = item.count / total;
    const segment = svgEl("circle", {
      cx: centre, cy: centre, r: radius, fill: "none",
      stroke: PALETTE[index % PALETTE.length],
      "stroke-width": stroke,
      "stroke-dasharray": `${fraction * circumference} ${circumference}`,
      "stroke-dashoffset": -offset,
      transform: `rotate(-90 ${centre} ${centre})`,
    });
    const title = svgEl("title");
    title.textContent = `${item.label}: ${item.count}`;
    segment.appendChild(title);
    svg.appendChild(segment);
    offset += fraction * circumference;
  });

  const centreValue = svgEl("text", {
    x: centre, y: centre - 2, "text-anchor": "middle",
    "font-size": 26, "font-weight": 700, style: "fill: var(--chart-strong)",
    "font-family": "Manrope, sans-serif",
  });
  centreValue.textContent = String(total);
  svg.appendChild(centreValue);

  const centreLabel = svgEl("text", {
    x: centre, y: centre + 18, "text-anchor": "middle",
    "font-size": 11, style: "fill: var(--chart-label)",
  });
  centreLabel.textContent = "total";
  svg.appendChild(centreLabel);

  const legend = items
    .map(
      (item, index) => `<li class="flex items-center gap-2 text-body-md">
        <span class="h-2.5 w-2.5 shrink-0 rounded-sm" style="background:${PALETTE[index % PALETTE.length]}"></span>
        <span class="text-on-surface-variant">${escapeHtml(item.label)}</span>
        <span class="ml-auto font-semibold text-on-surface">${item.count}</span>
      </li>`
    )
    .join("");

  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "chart-in flex flex-col items-center gap-4 sm:flex-row sm:items-center";
  wrapper.appendChild(svg);
  const legendEl = document.createElement("ul");
  legendEl.className = "w-full space-y-2 sm:max-w-[220px]";
  legendEl.innerHTML = legend;
  wrapper.appendChild(legendEl);
  container.appendChild(wrapper);

  const sr = document.createElement("p");
  sr.className = "sr-only";
  sr.textContent =
    "Application status distribution: " +
    items.map((i) => `${i.label} ${i.count}`).join(", ");
  container.appendChild(sr);
}

/* ---------------- bar chart ---------------- */

/**
 * @param {HTMLElement} container
 * @param {{label:string,count:number}[]} data
 */
export function barChart(container, data, { horizontal = true, valueLabel = "Applications" } = {}) {
  if (!container) return;
  const items = (data || []).filter((d) => d.count > 0 || d.label);

  if (!items.length || items.every((d) => d.count === 0)) {
    container.innerHTML =
      '<div class="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-outline-variant text-body-md text-on-surface-variant">No data for the selected filters.</div>';
    return;
  }

  const max = Math.max(...items.map((d) => d.count), 1);

  if (horizontal) {
    container.innerHTML = `
      <ul class="space-y-3">
        ${items
          .map(
            (item) => `<li>
              <div class="mb-1 flex items-baseline justify-between gap-3 text-body-md">
                <span class="truncate text-on-surface">${escapeHtml(item.label)}</span>
                <span class="shrink-0 font-semibold text-on-surface">${item.count}</span>
              </div>
              <div class="h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
                <div class="h-full rounded-full bg-primary transition-all"
                     style="width:${Math.max(3, (item.count / max) * 100)}%"></div>
              </div>
            </li>`
          )
          .join("")}
      </ul>
      <p class="sr-only">${escapeHtml(valueLabel)} by category: ${items
        .map((i) => `${i.label} ${i.count}`)
        .join(", ")}</p>`;
    return;
  }

  // vertical bars
  const width = 720;
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 46, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / items.length;
  const barW = Math.min(46, slot * 0.6);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`, class: "w-full",
    role: "img", "aria-label": `Bar chart of ${valueLabel.toLowerCase()}`,
  });

  items.forEach((item, index) => {
    const barH = (item.count / max) * innerH;
    const cx = pad.left + slot * index + slot / 2;
    const rect = svgEl("rect", {
      x: cx - barW / 2,
      y: pad.top + innerH - barH,
      width: barW,
      height: Math.max(barH, 2),
      rx: 5,
      fill: PALETTE[index % PALETTE.length],
    });
    const title = svgEl("title");
    title.textContent = `${item.label}: ${item.count}`;
    rect.appendChild(title);
    svg.appendChild(rect);

    const valueText = svgEl("text", {
      x: cx, y: pad.top + innerH - barH - 6, "text-anchor": "middle",
      "font-size": 11, "font-weight": 600, style: "fill: var(--chart-strong)",
    });
    valueText.textContent = String(item.count);
    svg.appendChild(valueText);

    const labelText = svgEl("text", {
      x: cx, y: height - 26, "text-anchor": "middle", "font-size": 11, style: "fill: var(--chart-label)",
    });
    const title2 = String(item.label);
    labelText.textContent = title2.length > 16 ? title2.slice(0, 15) + "…" : title2;
    const labelTitle = svgEl("title");
    labelTitle.textContent = title2;
    labelText.appendChild(labelTitle);
    svg.appendChild(labelText);
  });

  render(
    container, svg,
    `${valueLabel} bar chart: ` + items.map((i) => `${i.label} ${i.count}`).join(", ")
  );
}
