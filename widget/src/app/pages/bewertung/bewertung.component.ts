import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { GuestReviewService } from '../../services/guest-review.service';

type BwState = 'loading' | 'idle' | 'submitting' | 'success' | 'already' | 'invalid' | 'error';

interface Category {
  key: 'ratingService' | 'ratingFood' | 'ratingAmbiance' | 'ratingValue';
  label: string;
}

@Component({
  selector: 'wdg-bewertung',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './bewertung.component.html',
  styleUrl: './bewertung.component.scss',
})
export class BewertungComponent implements OnInit {
  private readonly svc   = inject(GuestReviewService);
  private readonly route = inject(ActivatedRoute);

  state       = signal<BwState>('loading');
  venueName   = signal('');
  errorMessage = signal('');

  private token = '';

  readonly categories: Category[] = [
    { key: 'ratingService',  label: 'Service' },
    { key: 'ratingFood',     label: 'Essen' },
    { key: 'ratingAmbiance', label: 'Ambiente' },
    { key: 'ratingValue',    label: 'Preis-Leistung' },
  ];

  ratings: Record<Category['key'], number> = {
    ratingService: 0,
    ratingFood: 0,
    ratingAmbiance: 0,
    ratingValue: 0,
  };

  comment = '';

  get allRated(): boolean {
    return this.categories.every(c => this.ratings[c.key] > 0);
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.token) {
      this.state.set('invalid');
      return;
    }

    this.svc.getContext(this.token).subscribe({
      next: ctx => {
        this.venueName.set(ctx.venueName);
        this.state.set(ctx.alreadySubmitted ? 'already' : 'idle');
      },
      error: () => this.state.set('invalid'),
    });
  }

  setRating(key: Category['key'], value: number): void {
    this.ratings[key] = value;
  }

  submit(): void {
    if (!this.allRated || this.state() === 'submitting') return;
    this.state.set('submitting');

    this.svc.submit(this.token, {
      ratingService:  this.ratings.ratingService,
      ratingFood:     this.ratings.ratingFood,
      ratingAmbiance: this.ratings.ratingAmbiance,
      ratingValue:    this.ratings.ratingValue,
      comment: this.comment.trim() || undefined,
    }).subscribe({
      next: () => this.state.set('success'),
      error: (err) => {
        if (err.status === 409) {
          this.state.set('already');
        } else {
          this.errorMessage.set('Die Bewertung konnte nicht gespeichert werden. Bitte versuche es erneut.');
          this.state.set('error');
        }
      },
    });
  }
}