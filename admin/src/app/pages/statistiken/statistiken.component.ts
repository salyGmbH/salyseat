import { Component, AfterViewInit, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import Chart from 'chart.js/auto';
import { StatistikenService, StatsTotals, StatsTimeslot, StatsMonthly, StatsTopGuest, StatsGuestTypes, StatsSources, StatsLeadTime, StatsGroupHeatmap, StatsInsights } from '../../services/statistiken.service';

// Inline-Plugin: Werte über den Balken rendern
const topLabelsPlugin = {
  id: 'topLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset: any, i: number) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((bar: any, index: number) => {
        const v = dataset.data[index];
        if (!v) return;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.80)';
        ctx.font = '600 11px Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(String(v), bar.x, bar.y - 4);
        ctx.restore();
      });
    });
  }
};

@Component({
  selector: 'app-statistiken',
  standalone: true,
  imports: [MatIconModule, DecimalPipe, TranslateModule],
  templateUrl: './statistiken.component.html',
  styleUrls: ['./statistiken.component.scss']
})
export class StatistikenComponent implements AfterViewInit {
  private readonly svc = inject(StatistikenService);

  // ─── Filter ──────────────────────────────────────────────────────────────────
  readonly MONTHS = [
    { n: 1, label: 'Jan' }, { n: 2,  label: 'Feb' }, { n: 3,  label: 'Mär' },
    { n: 4, label: 'Apr' }, { n: 5,  label: 'Mai' }, { n: 6,  label: 'Jun' },
    { n: 7, label: 'Jul' }, { n: 8,  label: 'Aug' }, { n: 9,  label: 'Sep' },
    { n: 10, label: 'Okt' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dez' },
  ];

  readonly years = (() => {
    const cur = new Date().getFullYear();
    const list: number[] = [];
    for (let y = 2025; y <= cur; y++) list.push(y);
    return list;
  })();

  selectedYear   = signal<number | 'all'>('all');
  selectedMonths = signal<number[]>([]);  // 1-12, leer = alle

  readonly showMonths = computed(() => this.selectedYear() !== 'all');

  readonly filterLabel = computed(() => {
    const y = this.selectedYear();
    if (y === 'all') return 'Gesamter Zeitraum';
    const ms = this.selectedMonths();
    if (ms.length === 0) return `Jahr ${y}`;
    if (ms.length === 1) return `${this.MONTHS[ms[0] - 1].label} ${y}`;
    return `${ms.length} Monate · ${y}`;
  });

  readonly selectedMonthLabels = computed(() =>
    this.selectedMonths().map(n => this.MONTHS[n - 1].label).join(', ')
  );

  readonly auslastungLabel = computed(() => {
    const y = this.selectedYear();
    if (y === 'all') return 'Auslastung (gesamt)';
    const ms = this.selectedMonths();
    if (ms.length === 0) return `Auslastung ${y}`;
    if (ms.length === 1) return `Auslastung ${this.MONTHS[ms[0] - 1].label} ${y}`;
    return `Auslastung (${ms.length} Monate)`;
  });

  readonly noShowRate = computed(() => {
    const t = this.totals();
    if (t.reservations === 0) return 0;
    return Math.round((t.noShows / t.reservations) * 100);
  });

  kpiLoading = signal(false);

  hasMonth(n: number): boolean {
    return this.selectedMonths().includes(n);
  }

  selectYear(y: number | 'all'): void {
    this.selectedYear.set(y);
    this.selectedMonths.set([]);
    this.reloadData();
  }

  toggleMonth(n: number): void {
    const cur = this.selectedMonths();
    const next = cur.includes(n) ? cur.filter(m => m !== n) : [...cur, n].sort((a, b) => a - b);
    this.selectedMonths.set(next);
    this.reloadData();
  }

  clearMonths(): void {
    this.selectedMonths.set([]);
    this.reloadData();
  }

  private getDateRange(): { from?: string; to?: string } {
    const y = this.selectedYear();
    if (y === 'all') return {};
    const ms = this.selectedMonths();
    if (ms.length === 0) return { from: `${y}-01-01`, to: `${y}-12-31` };
    const first = ms[0];
    const last  = ms[ms.length - 1];
    const lastDay = new Date(y, last, 0).getDate();
    return {
      from: `${y}-${String(first).padStart(2,'0')}-01`,
      to:   `${y}-${String(last).padStart(2,'0')}-${lastDay}`,
    };
  }

  private reloadData(): void {
    this.destroyCharts();
    this.kpiLoading.set(true);
    const { from, to } = this.getDateRange();
    this.svc.load(from, to).subscribe(data => {
      this.totals.set(data.totals);
      this.guestTypes.set(data.guestTypes);
      this.sources.set(data.sources);
      this.topGuests = data.topGuests;
      this.processTimeslots(data.timeslots);
      this.processMonthly(data.monthly);
      this.leadTime.set(data.leadTime);
      this.groupHeatmap.set(data.groupHeatmap);
      this.insights.set(data.insights);
      this.kpiLoading.set(false);
      this.createLineChart();
      this.createGuestTypesChart();
      this.createQuellenChart();
      this.createLeadTimeChart();
      this.buildAuslastungChart();
    });
  }

  // ─── KPI (real data) ────────────────────────────────────────────────────────
  totals = signal<StatsTotals>({ reservations: 0, guests: 0, noShows: 0, auslastung: 0 });

  // ─── Business-Insights (real data) ───────────────────────────────────────────
  insights = signal<StatsInsights>({
    waitlist: { total: 0, converted: 0, missed: 0, missedGuests: 0, conversionRate: null },
    topPackage: null,
    mismatch: null,
    growth: null,
  });

  topGuests: StatsTopGuest[] = [];

  // ─── Gästeart (real data) ────────────────────────────────────────────────────
  guestTypes = signal<StatsGuestTypes>({ new: 0, returning: 0, newPercent: 0, returningPercent: 0 });

  readonly guestTypesData = computed(() => [
    { label: 'Neukunden',       value: this.guestTypes().new,       pct: this.guestTypes().newPercent,       color: '#2979ff' },
    { label: 'Bestandskunden',  value: this.guestTypes().returning,  pct: this.guestTypes().returningPercent, color: '#22c55e' },
  ]);

  // ─── Quellen (real data) ─────────────────────────────────────────────────────
  sources = signal<StatsSources>({ online: 0, onlinePercent: 0, walkIn: 0, walkInPercent: 0, admin: 0, adminPercent: 0 });

  readonly quellenData = computed(() => [
    { label: 'Online-Widget', value: this.sources().online,  pct: this.sources().onlinePercent,  color: '#2979ff' },
    { label: 'Walk-in',       value: this.sources().walkIn,  pct: this.sources().walkInPercent,  color: '#f59e0b' },
    { label: 'Manuell',       value: this.sources().admin,   pct: this.sources().adminPercent,   color: '#22c55e' },
  ]);

  // ─── Buchungsvorlauf (real data) ─────────────────────────────────────────────
  leadTime = signal<StatsLeadTime>({ lastMinute: 0, lastMinutePercent: 0, shortTerm: 0, shortTermPercent: 0, planned: 0, plannedPercent: 0, longTerm: 0, longTermPercent: 0 });

  readonly leadTimeData = computed(() => [
    { label: 'statistiken.lead_time_last_minute', value: this.leadTime().lastMinute, pct: this.leadTime().lastMinutePercent, color: '#ef4444' },
    { label: 'statistiken.lead_time_short_term',  value: this.leadTime().shortTerm,  pct: this.leadTime().shortTermPercent,  color: '#ffb700' },
    { label: 'statistiken.lead_time_planned',     value: this.leadTime().planned,    pct: this.leadTime().plannedPercent,    color: '#2979ff' },
    { label: 'statistiken.lead_time_long_term',   value: this.leadTime().longTerm,   pct: this.leadTime().longTermPercent,   color: '#22c55e' },
  ]);

  readonly leadTimeTotal = computed(() =>
    this.leadTime().lastMinute + this.leadTime().shortTerm + this.leadTime().planned + this.leadTime().longTerm
  );

  readonly guestTypesTotal = computed(() => this.guestTypes().new + this.guestTypes().returning);
  readonly quellenTotal    = computed(() => this.sources().online + this.sources().walkIn + this.sources().admin);

  // ─── Auslastung (real data) ──────────────────────────────────────────────────
  auslastungFilter = 'ganzerTag';
  timeOptions = [
    { label: 'Ganzer Tag', value: 'ganzerTag' },
    { label: 'Lunch',      value: 'lunch'     },
    { label: 'Abend',      value: 'abend'     },
  ];

  private auslastungAllData: Record<string, { labels: string[]; data: number[] }> = {
    ganzerTag: { labels: [], data: [] },
    lunch:     { labels: [], data: [] },
    abend:     { labels: [], data: [] },
  };

  private lineChartInst?: Chart;
  private auslastungChart?: Chart;
  private guestTypesChartInst?: Chart;
  private quellenChartInst?: Chart;
  private leadTimeChartInst?: Chart;

  private destroyCharts(): void {
    this.lineChartInst?.destroy();
    this.auslastungChart?.destroy();
    this.guestTypesChartInst?.destroy();
    this.quellenChartInst?.destroy();
    this.leadTimeChartInst?.destroy();
    this.lineChartInst = undefined;
    this.auslastungChart = undefined;
    this.guestTypesChartInst = undefined;
    this.quellenChartInst = undefined;
    this.leadTimeChartInst = undefined;
  }

  // ─── Monatliche Reservierungen (real data) ───────────────────────────────────
  private monthlyLabels: string[] = [];
  private monthlyCounts: number[] = [];
  monthlyBadge = '';

  // ─── Stoßzeiten-Ranking (real data) — stärkster Moment je Wochentag ─────────
  private groupHeatmap = signal<StatsGroupHeatmap>({ labels: [], rows: [] });

  /** Backend liefert deutsche Kürzel (Mo/Di/…) — Mapping auf Übersetzungs-Keys statt fest verdrahteter Namen. */
  private readonly weekdayTranslationKeys: Record<string, string> = {
    Mo: 'statistiken.weekday_mo', Di: 'statistiken.weekday_di', Mi: 'statistiken.weekday_mi',
    Do: 'statistiken.weekday_do', Fr: 'statistiken.weekday_fr', Sa: 'statistiken.weekday_sa',
    So: 'statistiken.weekday_so',
  };

  /** Pro Wochentag der stärkste 15-Min-Slot (Ø Gäste), absteigend sortiert — max. 5 Einträge. */
  readonly topBusyTimes = computed(() => {
    const hm = this.groupHeatmap();
    return hm.rows
      .map(row => {
        let maxIdx = -1;
        let maxVal = 0;
        row.values.forEach((v, i) => {
          if (v > maxVal) { maxVal = v; maxIdx = i; }
        });
        if (maxIdx === -1) return null;
        return {
          weekdayKey: this.weekdayTranslationKeys[row.weekday] ?? row.weekday,
          time:       hm.labels[maxIdx],
          value:      maxVal,
        };
      })
      .filter((p): p is { weekdayKey: string; time: string; value: number } => p !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  });

  medalFor(index: number): string {
    return ['🥇', '🥈', '🥉'][index] ?? `${index + 1}.`;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.svc.load().subscribe(data => {
      this.totals.set(data.totals);
      this.guestTypes.set(data.guestTypes);
      this.sources.set(data.sources);
      this.topGuests = data.topGuests;
      this.processTimeslots(data.timeslots);
      this.processMonthly(data.monthly);
      this.leadTime.set(data.leadTime);
      this.groupHeatmap.set(data.groupHeatmap);
      this.insights.set(data.insights);

      this.createLineChart();
      this.createGuestTypesChart();
      this.createQuellenChart();
      this.createLeadTimeChart();
      this.buildAuslastungChart();
    });
  }

  // ─── Data processing ─────────────────────────────────────────────────────────
  private processTimeslots(slots: StatsTimeslot[]): void {
    const toChart = (arr: StatsTimeslot[]) => ({
      labels: arr.map(s => s.time),
      data:   arr.map(s => s.guests),
    });

    this.auslastungAllData = {
      ganzerTag: toChart(slots),
      lunch:     toChart(slots.filter(s => s.time >= '11:00' && s.time < '15:00')),
      abend:     toChart(slots.filter(s => s.time >= '17:00' && s.time < '23:00')),
    };
  }

  private processMonthly(monthly: StatsMonthly[]): void {
    this.monthlyLabels = monthly.map(m => this.formatMonth(m.month));
    this.monthlyCounts = monthly.map(m => m.count);

    if (monthly.length > 0) {
      const first = this.formatMonth(monthly[0].month);
      const last  = this.formatMonth(monthly[monthly.length - 1].month);
      this.monthlyBadge = first === last ? first : `${first} – ${last}`;
    }
  }

  private formatMonth(ym: string): string {
    const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
    const [year, month] = ym.split('-');
    return `${months[parseInt(month, 10) - 1]} ${year.slice(2)}`;
  }

  // ─── Auslastung Filter ───────────────────────────────────────────────────────
  setAuslastungFilter(v: string): void {
    this.auslastungFilter = v;
    const d = this.auslastungAllData[v];
    if (this.auslastungChart) {
      this.auslastungChart.data.labels = d.labels;
      this.auslastungChart.data.datasets[0].data = d.data;
      this.auslastungChart.update('active');
    }
  }

  // ─── Chart-Erstellung ────────────────────────────────────────────────────────
  private createLineChart(): void {
    const labels = this.monthlyLabels.length ? this.monthlyLabels : ['–'];
    const data   = this.monthlyCounts.length ? this.monthlyCounts : [0];

    this.lineChartInst = new Chart('lineChart', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Reservierungen',
          data,
          borderColor: '#2979ff',
          backgroundColor: 'rgba(41,121,255,0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#2979ff',
          pointRadius: 4,
          pointHoverRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { grid: { color: 'rgba(128,128,128,0.10)' }, ticks: { color: 'rgba(128,128,128,0.70)', font: { size: 12 } }, border: { display: false } },
          y: { grid: { color: 'rgba(128,128,128,0.10)' }, ticks: { color: 'rgba(128,128,128,0.70)', font: { size: 12 } }, border: { display: false } }
        }
      }
    });
  }

  private createLeadTimeChart(): void {
    const data = this.leadTimeData();
    this.leadTimeChartInst = new Chart('doughnutChart', {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '74%',
        plugins: { legend: { display: false } }
      }
    });
  }

  private createGuestTypesChart(): void {
    const data = this.guestTypesData();
    this.guestTypesChartInst = new Chart('guestTypesChart', {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '74%',
        plugins: { legend: { display: false } }
      }
    });
  }

  private createQuellenChart(): void {
    const data = this.quellenData();
    this.quellenChartInst = new Chart('quellenChart', {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '74%',
        plugins: { legend: { display: false } }
      }
    });
  }

  private buildAuslastungChart(): void {
    const canvas = document.getElementById('auslastungChart') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 280);
    grad.addColorStop(0,   'rgba(41,121,255,0.92)');
    grad.addColorStop(1,   'rgba(41,121,255,0.35)');

    const d = this.auslastungAllData[this.auslastungFilter];

    this.auslastungChart = new Chart(canvas, {
      type: 'bar',
      plugins: [topLabelsPlugin],
      data: {
        labels: d.labels,
        datasets: [{
          label: 'Gäste',
          data: d.data,
          backgroundColor: grad,
          borderRadius: 7,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.raw} Gäste` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: 'rgba(128,128,128,0.70)', font: { size: 11 } }, border: { display: false } },
          y: { display: false }
        }
      }
    } as any);
  }
}
