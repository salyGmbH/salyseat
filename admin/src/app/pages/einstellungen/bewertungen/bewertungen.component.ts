import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { GuestReviewService, GuestReview } from '../../../services/guest-review.service';
import { TenantSettingsService } from '../../../services/tenant-settings.service';

interface CategoryStat {
  key: 'ratingService' | 'ratingFood' | 'ratingAmbiance' | 'ratingValue';
  label: string;
  avg: number;
}

@Component({
  selector: 'app-bewertungen',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './bewertungen.component.html',
  styleUrl: './bewertungen.component.scss',
})
export class BewertungenComponent implements OnInit {
  readonly reviewSvc = inject(GuestReviewService);
  private readonly tenantSettings = inject(TenantSettingsService);

  infoOpen = false;

  reviewEnabled = false;
  reviewDelay: '2min' | '1h' | '4h' | '24h' | '3d' = '24h';

  saving = false;
  saved  = false;

  // ── Filter/Sortierung der Liste ────────────────────────────────────────
  activeFilter: 'all' | 'bad' | 'good' = 'all';
  private readonly expandedComments = new Set<string>();
  private static readonly COMMENT_TRUNCATE_LENGTH = 180;

  readonly categories: { key: 'ratingService' | 'ratingFood' | 'ratingAmbiance' | 'ratingValue'; label: string }[] = [
    { key: 'ratingService',  label: 'bewertungen.category_service' },
    { key: 'ratingFood',     label: 'bewertungen.category_food' },
    { key: 'ratingAmbiance', label: 'bewertungen.category_ambiance' },
    { key: 'ratingValue',    label: 'bewertungen.category_value' },
  ];

  // ── Übersicht: Gesamtschnitt, Schnitt pro Kategorie, Verteilung ───────────
  readonly totalCount = computed(() => this.reviewSvc.reviews().length);

  readonly overallAverage = computed(() => {
    const reviews = this.reviewSvc.reviews();
    if (!reviews.length) return 0;
    const sum = reviews.reduce((acc, r) => acc + this.averageFor(r), 0);
    return sum / reviews.length;
  });

  readonly categoryStats = computed<CategoryStat[]>(() => {
    const reviews = this.reviewSvc.reviews();
    return this.categories.map(c => {
      const values = reviews.map(r => r[c.key]).filter((v): v is number => v != null);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return { ...c, avg };
    });
  });

  /** Anzahl Bewertungen je gerundetem Gesamt-Sterne-Wert (5 → 1), für die Verteilungs-Balken. */
  readonly ratingDistribution = computed(() => {
    const reviews = this.reviewSvc.reviews();
    const counts = [0, 0, 0, 0, 0]; // Index 0 = 5 Sterne … Index 4 = 1 Stern
    for (const r of reviews) {
      const rounded = Math.min(5, Math.max(1, Math.round(this.averageFor(r))));
      counts[5 - rounded]++;
    }
    const max = Math.max(1, ...counts);
    return [5, 4, 3, 2, 1].map((stars, i) => ({ stars, count: counts[i], pct: (counts[i] / max) * 100 }));
  });

  ngOnInit(): void {
    this.tenantSettings.load().subscribe(s => {
      const rs = s.guestReviewSettings;
      if (rs) {
        this.reviewEnabled = rs.enabled;
        this.reviewDelay   = rs.delay;
      }
    });

    this.reviewSvc.load().subscribe(reviews => {
      // Beim Öffnen der Seite gelten alle sichtbaren Bewertungen als gesehen.
      for (const r of reviews) {
        if (!r.read) {
          this.reviewSvc.markRead(r.id).subscribe();
        }
      }
    });
  }

  averageFor(review: { ratingService: number | null; ratingFood: number | null; ratingAmbiance: number | null; ratingValue: number | null }): number {
    const values = [review.ratingService, review.ratingFood, review.ratingAmbiance, review.ratingValue]
      .filter((v): v is number => v != null);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  stars(n: number): number[] {
    return [1, 2, 3, 4, 5].slice(0, Math.round(n));
  }

  /** Farbliche Einstufung je Bewertung — damit schlechte Bewertungen sofort auffallen. */
  ratingTier(review: { ratingService: number | null; ratingFood: number | null; ratingAmbiance: number | null; ratingValue: number | null }): 'good' | 'warn' | 'bad' {
    const avg = this.averageFor(review);
    if (avg >= 4) return 'good';
    if (avg >= 3) return 'warn';
    return 'bad';
  }

  /** Gefiltert (nach Filter-Chip) + sortiert (schlechteste zuerst als Standard). */
  get filteredReviews(): GuestReview[] {
    let list = this.reviewSvc.reviews();
    if (this.activeFilter === 'bad')  list = list.filter(r => this.averageFor(r) < 4);
    if (this.activeFilter === 'good') list = list.filter(r => this.averageFor(r) >= 4);
    return [...list].sort((a, b) => this.averageFor(a) - this.averageFor(b));
  }

  get badCount(): number  { return this.reviewSvc.reviews().filter(r => this.averageFor(r) < 4).length; }
  get goodCount(): number { return this.reviewSvc.reviews().filter(r => this.averageFor(r) >= 4).length; }

  setFilter(filter: 'all' | 'bad' | 'good'): void {
    this.activeFilter = filter;
  }

  // ── Kommentar-Kürzung ─────────────────────────────────────────────────
  isLongComment(comment: string): boolean {
    return comment.length > BewertungenComponent.COMMENT_TRUNCATE_LENGTH;
  }

  truncatedComment(comment: string): string {
    return comment.slice(0, BewertungenComponent.COMMENT_TRUNCATE_LENGTH).trimEnd() + '…';
  }

  isCommentExpanded(id: string): boolean {
    return this.expandedComments.has(id);
  }

  toggleComment(id: string): void {
    if (this.expandedComments.has(id)) this.expandedComments.delete(id);
    else this.expandedComments.add(id);
  }

  save(): void {
    this.saving = true;
    const snapshot = this.tenantSettings.snapshot;
    this.tenantSettings.save({
      ...snapshot,
      guestReviewSettings: { enabled: this.reviewEnabled, delay: this.reviewDelay },
    }).subscribe({
      next: () => {
        this.saving = false;
        this.saved  = true;
        setTimeout(() => this.saved = false, 2000);
      },
      error: () => { this.saving = false; },
    });
  }
}
