import { Component, AfterViewInit, inject, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import Chart from 'chart.js/auto';
import { StatistikenService, StatsTotals, StatsTimeslot, StatsMonthly, StatsTopGuest, StatsGuestTypes, StatsSources } from '../../services/statistiken.service';

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
      this.kpiLoading.set(false);
      this.createLineChart();
      this.createGuestTypesChart();
      this.createQuellenChart();
      this.buildAuslastungChart();
    });
  }

  // ─── KPI (real data) ────────────────────────────────────────────────────────
  totals = signal<StatsTotals>({ reservations: 0, guests: 0, noShows: 0, auslastung: 0 });

  // ─── KPI (static / not available from DB yet) ────────────────────────────────
  metrics = [
    { name: 'Reservierungsrate',    value: 90 },
    { name: 'Auslastung',           value: 75 },
    { name: 'Kundenzufriedenheit',  value: 65 },
    { name: 'Pünktlichkeit',        value: 80 },
    { name: 'Wiederkehrende Gäste', value: 70 }
  ];

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

  geraeteData = [
    { label: 'Desktop', value: 55, color: '#2979ff' },
    { label: 'Mobile',  value: 35, color: '#ffb700' },
    { label: 'Tablet',  value: 10, color: '#22c55e' },
  ];

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

  private destroyCharts(): void {
    this.lineChartInst?.destroy();
    this.auslastungChart?.destroy();
    this.lineChartInst = undefined;
    this.auslastungChart = undefined;
  }

  // ─── Monatliche Reservierungen (real data) ───────────────────────────────────
  private monthlyLabels: string[] = [];
  private monthlyCounts: number[] = [];
  monthlyBadge = '';

  // ─── Gruppen-Heatmap (static) ────────────────────────────────────────────────
  gruppenFilter = 'ganzerTag';

  gruppenLabels = ['17:00',':15',':30',':45','18:00',':15',':30',':45','19:00',':15',':30',':45','20:00',':15',':30',':45','21:00'];

  gruppenRows: number[][] = [
    [20, 0,  2,  0, 20,  0, 20,  0,  2,  2,  2,  0,  0,  4,  0,  0, 14],
    [ 9, 0,  2,  0,  0,  2,  2,  2,  2,  2,  2,  4,  4,  4,  2,  2,  0],
    [ 0, 6,  3,  3,  0,  3,  3,  2,  4,  4,  4,  5,  4,  3,  4,  5,  2],
    [ 2, 3,  2,  2,  3,  3,  3,  4,  5,  6,  7,  8,  4,  3,  5,  6,  4],
    [ 3, 4,  5, 18,  4,  4,  5,  6,  7,  8,  4,  4,  4,  4,  4,  4,  2],
  ];

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.svc.load().subscribe(data => {
      this.totals.set(data.totals);
      this.guestTypes.set(data.guestTypes);
      this.sources.set(data.sources);
      this.topGuests = data.topGuests;
      this.processTimeslots(data.timeslots);
      this.processMonthly(data.monthly);

      this.createLineChart();
      this.createDoughnutChart();
      this.createGuestTypesChart();
      this.createQuellenChart();
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

  // ─── Heatmap helpers ─────────────────────────────────────────────────────────
  heatBg(v: number): string {
    if (!v) return 'transparent';
    const t = Math.min(v / 20, 1);
    const a = 0.18 + t * 0.77;
    return `rgba(41,121,255,${a.toFixed(2)})`;
  }

  heatFg(v: number): string {
    if (!v) return 'transparent';
    return Math.min(v / 20, 1) > 0.45 ? 'rgba(255,255,255,0.95)' : 'rgba(41,121,255,1)';
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

  private createDoughnutChart(): void {
    new Chart('doughnutChart', {
      type: 'doughnut',
      data: {
        labels: ['Desktop', 'Mobile', 'Tablet'],
        datasets: [{ data: [55, 35, 10], backgroundColor: ['#2979ff', '#ffb700', '#22c55e'], borderWidth: 0, hoverOffset: 8 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '74%',
        plugins: { legend: { display: false } }
      }
    });
  }

  private createGuestTypesChart(): void {
    const data = this.guestTypesData();
    new Chart('guestTypesChart', {
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
    new Chart('quellenChart', {
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
