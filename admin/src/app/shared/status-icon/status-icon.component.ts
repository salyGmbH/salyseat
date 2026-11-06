import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export const STATUS_ICON_IDS = [
  'clock','hourglass','bell','users','door-front','play','utensils','chair',
  'check','check-circle','circle-dot','alert-triangle','clock-alert','clock-fast',
  'euro','credit-card','wallet','cash','flag','door-out','x-circle','ban',
  'ghost','user-x','phone-off','trash','slash','archive','star',
] as const;
export type StatusIconId = (typeof STATUS_ICON_IDS)[number];

export interface StatusIconMeta {
  id: StatusIconId;
  label: string;
  description: string;
}

export const STATUS_ICONS_META: StatusIconMeta[] = STATUS_ICON_IDS.map(id => ({ id, label: id, description: '' }));

export const SUGGESTED_ICONS_BY_STATUS: Record<string, StatusIconId[]> = {
  waiting:   ['clock','hourglass','bell','users','door-front'],
  active:    ['play','utensils','chair','circle-dot','check'],
  late:      ['clock-alert','clock-fast','alert-triangle','bell'],
  paid:      ['euro','credit-card','wallet','cash'],
  completed: ['check-circle','flag','door-out','check','archive'],
  no_show:   ['ghost','user-x','phone-off','alert-triangle'],
  cancelled: ['x-circle','ban','slash','trash'],
};

@Component({
  selector: 'app-status-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 24 24'" fill="none" stroke="currentColor"
         stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
         [attr.width]="size" [attr.height]="size" [attr.aria-hidden]="true">
      @switch (name) {
        @case ('clock') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/> }
        @case ('hourglass') { <path d="M6 3h12M6 21h12"/><path d="M7 3v3a5 5 0 0 0 10 0V3"/><path d="M7 21v-3a5 5 0 0 1 10 0v3"/> }
        @case ('bell') { <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10 19a2 2 0 0 0 4 0"/> }
        @case ('users') { <circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M14 20c1-3 4-4 7-3"/> }
        @case ('door-front') { <rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="15" cy="12" r="0.6" fill="currentColor"/><path d="M5 21h14"/> }
        @case ('play') { <path d="M8 5v14l11-7z"/> }
        @case ('utensils') { <path d="M7 3v6a2 2 0 0 0 2 2v10"/><path d="M9 3v6"/><path d="M5 3v6a2 2 0 0 0 2 2"/><path d="M16 3c-2 0-3 4-3 8h6V3z"/><path d="M16 11v10"/> }
        @case ('chair') { <path d="M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><path d="M5 13v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/><path d="M5 13h14"/><path d="M7 13v8M17 13v8"/> }
        @case ('check') { <path d="M4 12l5 5L20 6"/> }
        @case ('check-circle') { <circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/> }
        @case ('circle-dot') { <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/> }
        @case ('alert-triangle') { <path d="M12 3l10 17H2z"/><path d="M12 10v4"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor"/> }
        @case ('clock-alert') { <circle cx="10" cy="14" r="7"/><path d="M10 10v4l2 2"/><path d="M19 4v5"/><circle cx="19" cy="11.5" r="0.6" fill="currentColor"/> }
        @case ('clock-fast') { <circle cx="14" cy="12" r="7"/><path d="M14 8v4l2.5 1.5"/><path d="M3 8h4M3 12h6M3 16h4"/> }
        @case ('euro') { <circle cx="12" cy="12" r="9"/><path d="M15 8a3 3 0 0 0-3-2 4 6 0 0 0 0 12 3 3 0 0 0 3-2"/><path d="M8 11h6M8 13h6"/> }
        @case ('credit-card') { <rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 15h2M12 15h3"/> }
        @case ('wallet') { <path d="M3 7a2 2 0 0 1 2-2h12v4"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7H7a2 2 0 0 1 0-4h14"/><circle cx="17" cy="14" r="0.7" fill="currentColor"/> }
        @case ('cash') { <rect x="3" y="7" width="18" height="10" rx="1"/><circle cx="12" cy="12" r="2"/><path d="M6 10h0.01M18 14h0.01"/> }
        @case ('flag') { <path d="M5 22V4"/><path d="M5 4h13l-2 5 2 5H5"/> }
        @case ('door-out') { <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M9 12h11"/><path d="M16 8l4 4-4 4"/> }
        @case ('x-circle') { <circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/> }
        @case ('ban') { <circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/> }
        @case ('ghost') { <path d="M5 21V11a7 7 0 0 1 14 0v10l-2-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="11" r="0.7" fill="currentColor"/><circle cx="14.5" cy="11" r="0.7" fill="currentColor"/> }
        @case ('user-x') { <circle cx="9" cy="8" r="4"/><path d="M3 21a6 6 0 0 1 12 0"/><path d="M16 5l5 5M21 5l-5 5"/> }
        @case ('phone-off') { <path d="M22 17v3a2 2 0 0 1-2 2 18 18 0 0 1-12-5 18 18 0 0 1-5-12 2 2 0 0 1 2-2h3"/><path d="M3 3l18 18"/> }
        @case ('trash') { <path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/> }
        @case ('slash') { <circle cx="12" cy="12" r="9"/><path d="M5 5l14 14"/> }
        @case ('archive') { <rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/> }
        @case ('star') { <path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/> }
        @default { <circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2.5l-1.5 1.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/> }
      }
    </svg>
  `,
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }`],
})
export class StatusIconComponent {
  @Input({ required: true }) name!: string;
  @Input() size: number | string = 20;
}
