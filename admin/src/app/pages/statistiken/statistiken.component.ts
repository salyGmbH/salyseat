import { Component, AfterViewInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import Chart from 'chart.js/auto';

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
  imports: [MatIconModule],
  templateUrl: './statistiken.component.html',
  styleUrls: ['./statistiken.component.scss']
})
export class StatistikenComponent implements AfterViewInit {

  // ─── KPI ────────────────────────────────────────────────────────────────────
  metrics = [
    { name: 'Reservierungsrate',    value: 90 },
    { name: 'Auslastung',           value: 75 },
    { name: 'Kundenzufriedenheit',  value: 65 },
    { name: 'Pünktlichkeit',        value: 80 },
    { name: 'Wiederkehrende Gäste', value: 70 }
  ];

  topUsers = [
    { name: 'Max Mustermann', actions: 120, active: true  },
    { name: 'Anna Schmidt',   actions:  80, active: false },
    { name: 'John Doe',       actions: 200, active: true  },
  ];

  // ─── Anlässe & Quellen ───────────────────────────────────────────────────────
  anlassData = [
    { label: 'Barbereich',      value: 42, color: '#2979ff' },
    { label: 'Essen & Trinken', value: 35, color: '#ffb700' },
    { label: 'VIP-Lounge',      value: 23, color: '#22c55e' },
  ];

  quellenData = [
    { label: 'Webseite', value: 148, color: '#2979ff' },
    { label: 'In Haus',  value:  52, color: '#ffb700' },
    { label: 'Telefon',  value:  31, color: '#22c55e' },
  ];

  geraeteData = [
    { label: 'Desktop', value: 55, color: '#2979ff' },
    { label: 'Mobile',  value: 35, color: '#ffb700' },
    { label: 'Tablet',  value: 10, color: '#22c55e' },
  ];

  get anlassTotal(): number { return this.anlassData.reduce((s, d) => s + d.value, 0); }
  get quellenTotal(): number { return this.quellenData.reduce((s, d) => s + d.value, 0); }

  // ─── Auslastung ──────────────────────────────────────────────────────────────
  auslastungFilter = 'ganzerTag';
  timeOptions = [
    { label: 'Ganzer Tag', value: 'ganzerTag' },
    { label: 'Lunch',      value: 'lunch'     },
    { label: 'Abend',      value: 'abend'     },
  ];

  private auslastungAllData: Record<string, { labels: string[]; data: number[] }> = {
    ganzerTag: {
      labels: ['12:00','12:30','13:00','13:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00'],
      data:   [  20,    38,    55,    42,    9,    15,    35,    53,    68,    88,   105,   125,   141],
    },
    lunch: {
      labels: ['11:30','12:00','12:30','13:00','13:30','14:00'],
      data:   [  12,    20,    38,    55,    42,    18],
    },
    abend: {
      labels: ['17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00','21:30'],
      data:   [   9,    15,    35,    53,    68,    88,   105,   125,   141,   156],
    },
  };

  private auslastungChart?: Chart;

  // ─── Gruppen-Heatmap ─────────────────────────────────────────────────────────
  gruppenFilter = 'ganzerTag';

  gruppenLabels = ['17:00',':15',':30',':45','18:00',':15',':30',':45','19:00',':15',':30',':45','20:00',':15',':30',':45','21:00'];

  // Jede Zeile = eine Buchungsebene; 0 = kein Eintrag
  gruppenRows: number[][] = [
    [20, 0,  2,  0, 20,  0, 20,  0,  2,  2,  2,  0,  0,  4,  0,  0, 14],
    [ 9, 0,  2,  0,  0,  2,  2,  2,  2,  2,  2,  4,  4,  4,  2,  2,  0],
    [ 0, 6,  3,  3,  0,  3,  3,  2,  4,  4,  4,  5,  4,  3,  4,  5,  2],
    [ 2, 3,  2,  2,  3,  3,  3,  4,  5,  6,  7,  8,  4,  3,  5,  6,  4],
    [ 3, 4,  5, 18,  4,  4,  5,  6,  7,  8,  4,  4,  4,  4,  4,  4,  2],
  ];

  // ─── Lifecycle ───────────────────────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.createLineChart();
    this.createDoughnutChart();
    this.createAnlassChart();
    this.createQuellenChart();
    this.buildAuslastungChart();
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
    new Chart('lineChart', {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun'],
        datasets: [{
          label: 'Umsatz (€)',
          data: [1200, 1900, 3000, 2500, 3200, 4000],
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

  private createAnlassChart(): void {
    new Chart('anlassChart', {
      type: 'doughnut',
      data: {
        labels: this.anlassData.map(d => d.label),
        datasets: [{ data: this.anlassData.map(d => d.value), backgroundColor: this.anlassData.map(d => d.color), borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '74%',
        plugins: { legend: { display: false } }
      }
    });
  }

  private createQuellenChart(): void {
    new Chart('quellenChart', {
      type: 'doughnut',
      data: {
        labels: this.quellenData.map(d => d.label),
        datasets: [{ data: this.quellenData.map(d => d.value), backgroundColor: this.quellenData.map(d => d.color), borderWidth: 0, hoverOffset: 6 }]
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
