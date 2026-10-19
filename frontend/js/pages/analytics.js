/* Analytics: summary metrics + charts with optional date filters. */

import { api, qs as qsParams } from "/js/api.js";
import { requireAuth } from "/js/auth.js";
import { mountRecruiterLayout } from "/js/layout.js";
import { icon } from "/js/icons.js";
import { lineChart, donutChart, barChart } from "/js/charts.js";
import { metricCard, toastError, qs } from "/js/ui.js";

await requireAuth();
mountRecruiterLayout({ active: "analytics", title: "Analytics" });

function filters() {
  return {
    date_from: qs("#date-from").value || undefined,
    date_to: qs("#date-to").value || undefined,
  };
}

async function load() {
  const f = qsParams(filters());
  try {
    const [summaryBody, trendBody, distBody, jobsBody, skillsBody] = await Promise.all([
      api.get(`/analytics/summary${f}`),
      api.get(`/analytics/applications-over-time${f}`),
      api.get(`/analytics/status-distribution${f}`),
      api.get(`/analytics/jobs${f}`),
      api.get(`/analytics/skills${f}`),
    ]);
    const s = summaryBody.data;

    qs("#summary-metrics").innerHTML = [
      metricCard({ label: "Applications received", value: s.applications_received, iconName: "Inbox", tone: "primary" }),
      metricCard({ label: "Open jobs", value: s.open_jobs, iconName: "Work", tone: "secondary", caption: `${s.jobs_created} created in total` }),
      metricCard({ label: "In interview", value: s.interviews, iconName: "CalendarMonth", tone: "tertiary" }),
      metricCard({ label: "Hires", value: s.hires, iconName: "CheckCircle", tone: "success" }),
    ].join("");

    lineChart(qs("#trend-chart"), trendBody.data);
    donutChart(
      qs("#status-chart"),
      (distBody.data || []).map((item) => ({ label: item.status, count: item.count }))
    );
    barChart(
      qs("#jobs-chart"),
      (jobsBody.data || []).map((j) => ({ label: j.title, count: j.applications })),
      { valueLabel: "Applications" }
    );
    barChart(
      qs("#skills-chart"),
      (skillsBody.data || []).map((k) => ({ label: k.skill, count: k.count })),
      { valueLabel: "Resumes containing skill" }
    );
  } catch (err) {
    toastError(err);
  }
}

qs("#apply-filters").addEventListener("click", load);
qs("#date-from").addEventListener("change", load);
qs("#date-to").addEventListener("change", load);

load();
