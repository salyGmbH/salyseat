import { Injectable, signal, computed } from '@angular/core';
import { WidgetLang } from './reservations.service';

export interface WidgetLabels {
  // Navigation
  back:              string;
  backToForm:        string;
  next:              string;
  nextToSummary:     string;
  confirm:           string;
  reset:             string;
  close:             string;

  // Steps
  stepDate:          string;
  stepTime:          string;
  stepGuests:        string;
  stepContact:       string;
  stepExtras:        string;
  stepSummary:       string;
  stepPayment:       string;
  extrasTitle:       string;
  extrasSubtitle:    string;

  // Form labels
  firstName:         string;
  lastName:          string;
  email:             string;
  phone:             string;
  notes:             string;
  notesPlaceholder:  string;
  occasionLabel:       string;
  occasionPlaceholder: string;

  // Date / time
  today:             string;
  noSlotsAvailable:  string;
  closedDay:         string;
  selectDate:        string;
  selectTime:        string;

  // People
  guest:             string;
  guests:            string;

  // Seat / table
  seats:             string;
  tableType:         string;

  // Booking flow
  loading:           string;
  bookingTitle:      string;
  bookingSubtitle:   string;
  submitLabel:       string;

  // Success
  successTitle:      string;
  successText:       string;
  successEmail:      string;
  downloadPdf:       string;
  newBooking:        string;

  // Error / validation
  errorRequired:     string;
  errorEmail:        string;
  errorPhone:        string;
  errorGeneric:      string;
  consentRequired:   string;

  // No-show / payment
  noShowNotice:      string;
  paymentTitle:      string;
  paymentSecure:     string;

  // Misc
  highDemand:        string;
  groupInfo:         string;
  allergene:         string;
  childChairs:       string;
  wheelchair:        string;
  venue:             string;
  chooseVenueTitle:  string;
  chooseVenueHint:   string;
  tischwahlInvalidHint: string;

  // Extended – booking flow UI
  understood:           string;
  menuLabel:            string;
  reserve:              string;
  yourData:             string;
  yourDataFormal:       string;
  processing:           string;
  paying:               string;
  cancel:               string;
  submitting:           string;
  submitReservation:    string;
  consentText:          string;
  allergiesLabel:       string;
  dogLabel:             string;
  wheelchairLabel:      string;
  packagesLabel:        string;
  optionalLabel:        string;
  noPackageOption:      string;
  perPersonSuffix:      string;
  packageCatMenu:       string;
  packageCatEvent:      string;
  packageCatFeier:      string;
  packageCatSonstiges:  string;
  packageDurationSuffix: string;
  packageIncludesMore:  string;
  bookingConfirmed:     string;
  successPerson:        string;
  successPersons:       string;
  successSaved:         string;
  successConfirmEmail:  string;
  changePossibleUntil:  string;
  cancelPossibleUntil:  string;
  liveBooking:          string;
  hour:                 string;
  minute:               string;
  selectTableTitle:     string;
  chooseRoomLabel:      string;
  tapTable:             string;
  confirmTable:         string;
  tablesDimmed:         string;
  tablesDimmedPlural:   string;
  tableSelected:        string;
  changeTable:          string;
  autoAssign:           string;
  autoAssignSub:        string;
  chooseSelf:           string;
  chooseSelfSub:        string;
  creditCardTitle:      string;
  completePayment:      string;
  reservationPending:   string;
  selectGuests:         string;
  overviewLabel:        string;
  selectTableSubtitle:  string;
  tablePlanDateHint:    string;

  // Time / locale
  clockSuffix:          string; // ' Uhr' in DE, '' in EN
  emailPlaceholder:     string;
  phonePlaceholder:     string;
  menuTitle:            string;

  // Success sentence parts
  successThanks:        string;
  successReservOn:      string;
  successAtTime:        string;
  successForPeople:     string;
  successInVenue:       string;
  beforeReserv:         string;

  // Calendar / aria
  prevMonth:            string;
  nextMonth:            string;
  guestsSelect:         string;
  guestsCount:          string;
  guestsDecrease:       string;
  guestsIncrease:       string;
  timeSelect:           string;
  closePicker:          string;
  bookingProgress:      string;
  pageLoading:          string;
  paymentRegion:        string;
  paymentConfirm:       string;
  paymentCancel:        string;
  hintClose:            string;

  // Warteliste
  waitlistHint:         string;
  waitlistFull:         string;
  waitlistModalTitle:   string;
  waitlistModalSubmit:  string;
  waitlistModalSuccess: string;
  waitlistModalError:   string;
}

const DE: WidgetLabels = {
  back:              'Zurück',
  backToForm:        'Zurück zur Dateneingabe',
  next:              'Weiter',
  nextToSummary:     'Weiter zur Zusammenfassung',
  confirm:           'Bestätigen',
  reset:             'Zurücksetzen',
  close:             'Schließen',

  stepDate:          'Datum',
  stepTime:          'Uhrzeit',
  stepGuests:        'Personen',
  stepContact:       'Kontakt',
  stepExtras:        'Zusatzwünsche',
  stepSummary:       'Zusammenfassung',
  stepPayment:       'Zahlung',
  extrasTitle:       'Zusatzwünsche',
  extrasSubtitle:    'Optional — nur ausfüllen, falls gewünscht.',

  firstName:         'Vorname',
  lastName:          'Nachname',
  email:             'E-Mail',
  phone:             'Telefon',
  notes:             'Nachricht',
  notesPlaceholder:  'Besondere Wünsche, Anlässe …',
  occasionLabel:       'Anlass',
  occasionPlaceholder: 'z. B. Geburtstag, Jubiläum …',

  today:             'Heute',
  noSlotsAvailable:  'Keine verfügbaren Zeiten',
  closedDay:         'An diesem Tag geschlossen',
  selectDate:        'Datum wählen',
  selectTime:        'Uhrzeit wählen',

  guest:             'Gast',
  guests:            'Gäste',

  seats:             'Plätze',
  tableType:         'Tischart',

  loading:           'Wird geladen …',
  bookingTitle:      'Tisch reservieren',
  bookingSubtitle:   '',
  submitLabel:       'Reservierung absenden',

  successTitle:      'Vielen Dank!',
  successText:       'Deine Reservierungsanfrage ist bei uns eingegangen.',
  successEmail:      'Wir haben dir eine Bestätigung an deine E-Mail-Adresse gesendet.',
  downloadPdf:       'Bestätigung herunterladen',
  newBooking:        'Neue Reservierung',

  errorRequired:     'Dieses Feld ist erforderlich.',
  errorEmail:        'Bitte gib eine gültige E-Mail-Adresse ein.',
  errorPhone:        'Bitte gib eine gültige Telefonnummer ein.',
  errorGeneric:      'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
  consentRequired:   'Bitte stimme den Bedingungen zu.',

  noShowNotice:      'Kreditkarte wird nur bei Nicht-Erscheinen belastet.',
  paymentTitle:      'Zahlungsdaten',
  paymentSecure:     'Sichere Verbindung',

  highDemand:        'Hohe Nachfrage',
  groupInfo:         'Für größere Gruppen bitte telefonisch anfragen.',
  allergene:         'Allergene',
  childChairs:       'Kinderstühle',
  wheelchair:        'Rollstuhlgerecht',
  venue:             'Bereich',
  chooseVenueTitle:  'Wähle deinen Bereich',
  chooseVenueHint:   'Die Verfügbarkeit von Datum und Uhrzeit richtet sich nach dem gewählten Bereich.',
  tischwahlInvalidHint: 'Für diese Auswahl ist aktuell keine Reservierung möglich. Bitte passe Datum, Uhrzeit oder Personenzahl an.',

  understood:           'Verstanden',
  menuLabel:            'Speisekarte ansehen',
  reserve:              'Reservieren',
  yourData:             'Deine Daten',
  yourDataFormal:       'Ihre Daten',
  processing:           'Wird verarbeitet …',
  paying:               'Jetzt bezahlen',
  cancel:               'Abbrechen',
  submitting:           'Wird gesendet …',
  submitReservation:    'Reservierung absenden',
  consentText:          'Ich willige ein, dass meine Daten zur Bearbeitung der Reservierung gespeichert werden.',
  allergiesLabel:       'Allergien / Unverträglichkeiten',
  dogLabel:             'Hund dabei',
  wheelchairLabel:      'Rollstuhlgerechter Platz gewünscht',
  packagesLabel:        'Package auswählen (optional)',
  optionalLabel:        'optional',
  noPackageOption:      'Kein Package',
  perPersonSuffix:      '€ / Person',
  packageCatMenu:       'Menü',
  packageCatEvent:      'Event',
  packageCatFeier:      'Feier',
  packageCatSonstiges:  'Sonstiges',
  packageDurationSuffix: 'h',
  packageIncludesMore:  'mehr',
  bookingConfirmed:     'Reservierung bestätigt',
  successPerson:        'Person',
  successPersons:       'Personen',
  successSaved:         'wurde gespeichert.',
  successConfirmEmail:  'Du erhältst in Kürze eine Bestätigungsmail.',
  changePossibleUntil:  'Änderungen möglich bis',
  cancelPossibleUntil:  'Stornierung möglich bis',
  liveBooking:          'Live · Tisch buchen',
  hour:                 'Stunde',
  minute:               'Minute',
  selectTableTitle:     'Tisch wählen',
  chooseRoomLabel:      'Wähle einen Raum',
  tapTable:             'Tisch antippen',
  confirmTable:         'bestätigen',
  tablesDimmed:         'Tisch ausgegraut',
  tablesDimmedPlural:   'Tische ausgegraut',
  tableSelected:        'ausgewählt',
  changeTable:          'Ändern',
  autoAssign:           'Automatisch zuweisen',
  autoAssignSub:        'Wir wählen den besten Tisch für dich',
  chooseSelf:           'Tisch selbst wählen',
  chooseSelfSub:        'Wähle deinen Lieblingstisch im Grundriss',
  creditCardTitle:      'Kreditkarte hinterlegen',
  completePayment:      'Zahlung abschließen',
  reservationPending:   'Deine Reservierung ist vorgemerkt. Bitte schließe jetzt die Zahlung ab.',
  selectGuests:         'Personen wählen',
  overviewLabel:        'Übersicht',
  selectTableSubtitle:  'Möchtest du deinen Tisch selbst aussuchen oder soll automatisch ein passender Tisch für dich reserviert werden?',
  tablePlanDateHint:    'Verfügbarkeit bezieht sich auf heute — dein Datum wählst du im nächsten Schritt.',

  clockSuffix:          ' Uhr',
  emailPlaceholder:     'name@beispiel.de',
  phonePlaceholder:     '+49 …',
  menuTitle:            'Speisekarte',

  successThanks:        'Danke',
  successReservOn:      'Deine Reservierung am',
  successAtTime:        'um',
  successForPeople:     'für',
  successInVenue:       'im',
  beforeReserv:         'vor der Reservierung.',

  prevMonth:            'Vorheriger Monat',
  nextMonth:            'Nächster Monat',
  guestsSelect:         'Personenanzahl wählen',
  guestsCount:          'Personenanzahl',
  guestsDecrease:       'Personenanzahl verringern',
  guestsIncrease:       'Personenanzahl erhöhen',
  timeSelect:           'Uhrzeit wählen',
  closePicker:          'Auswahl schließen',
  bookingProgress:      'Buchungsfortschritt',
  pageLoading:          'Seite wird geladen',
  paymentRegion:        'Zahlung',
  paymentConfirm:       'Zahlung bestätigen',
  paymentCancel:        'Zahlung abbrechen',
  hintClose:            'Hinweis schließen',

  waitlistHint:         'Auf die Warteliste setzen',
  waitlistFull:         'Warteliste',
  waitlistModalTitle:   'Auf die Warteliste setzen',
  waitlistModalSubmit:  'Eintragen',
  waitlistModalSuccess: 'Du wurdest auf die Warteliste gesetzt. Wir melden uns innerhalb von {hours} Stunden, falls ein Platz frei wird.',
  waitlistModalError:   'Eintragung fehlgeschlagen. Bitte versuche es erneut.',
};

const EN: WidgetLabels = {
  back:              'Back',
  backToForm:        'Back to details',
  next:              'Next',
  nextToSummary:     'Continue to summary',
  confirm:           'Confirm',
  reset:             'Reset',
  close:             'Close',

  stepDate:          'Date',
  stepTime:          'Time',
  stepGuests:        'Guests',
  stepContact:       'Contact',
  stepExtras:        'Extras',
  stepSummary:       'Summary',
  stepPayment:       'Payment',
  extrasTitle:       'Extras',
  extrasSubtitle:    'Optional — fill in only if needed.',

  firstName:         'First name',
  lastName:          'Last name',
  email:             'Email',
  phone:             'Phone',
  notes:             'Message',
  notesPlaceholder:  'Special requests, occasions …',
  occasionLabel:       'Occasion',
  occasionPlaceholder: 'e.g. birthday, anniversary …',

  today:             'Today',
  noSlotsAvailable:  'No available times',
  closedDay:         'Closed on this day',
  selectDate:        'Select date',
  selectTime:        'Select time',

  guest:             'Guest',
  guests:            'Guests',

  seats:             'Seats',
  tableType:         'Table type',

  loading:           'Loading …',
  bookingTitle:      'Reserve a table',
  bookingSubtitle:   '',
  submitLabel:       'Send reservation',

  successTitle:      'Thank you!',
  successText:       'We have received your reservation request.',
  successEmail:      'We sent a confirmation to your email address.',
  downloadPdf:       'Download confirmation',
  newBooking:        'New reservation',

  errorRequired:     'This field is required.',
  errorEmail:        'Please enter a valid email address.',
  errorPhone:        'Please enter a valid phone number.',
  errorGeneric:      'An error occurred. Please try again.',
  consentRequired:   'Please accept the terms.',

  noShowNotice:      'Your card will only be charged in case of a no-show.',
  paymentTitle:      'Payment details',
  paymentSecure:     'Secure connection',

  highDemand:        'High demand',
  groupInfo:         'For larger groups please call us.',
  allergene:         'Allergens',
  childChairs:       'High chairs',
  wheelchair:        'Wheelchair accessible',
  venue:             'Area',
  chooseVenueTitle:  'Choose your area',
  chooseVenueHint:   'Date and time availability depends on the selected area.',
  tischwahlInvalidHint: 'No reservation is possible for this selection right now. Please adjust the date, time, or party size.',

  understood:           'Got it',
  menuLabel:            'View menu',
  reserve:              'Reserve',
  yourData:             'Your details',
  yourDataFormal:       'Your details',
  processing:           'Processing …',
  paying:               'Pay now',
  cancel:               'Cancel',
  submitting:           'Sending …',
  submitReservation:    'Send reservation',
  consentText:          'I consent to my data being stored to process the reservation.',
  allergiesLabel:       'Allergies / Intolerances',
  dogLabel:             'Dog with me',
  wheelchairLabel:      'Wheelchair-accessible seat requested',
  packagesLabel:        'Select a package (optional)',
  optionalLabel:        'optional',
  noPackageOption:      'No package',
  perPersonSuffix:      '€ / person',
  packageCatMenu:       'Menu',
  packageCatEvent:      'Event',
  packageCatFeier:      'Celebration',
  packageCatSonstiges:  'Other',
  packageDurationSuffix: 'h',
  packageIncludesMore:  'more',
  bookingConfirmed:     'Booking confirmed',
  successPerson:        'person',
  successPersons:       'people',
  successSaved:         'has been saved.',
  successConfirmEmail:  'You will receive a confirmation email shortly.',
  changePossibleUntil:  'Changes possible until',
  cancelPossibleUntil:  'Cancellation possible until',
  liveBooking:          'Live · Book table',
  hour:                 'Hour',
  minute:               'Minute',
  selectTableTitle:     'Select table',
  chooseRoomLabel:      'Choose a room',
  tapTable:             'Tap a table',
  confirmTable:         'confirm',
  tablesDimmed:         'table dimmed',
  tablesDimmedPlural:   'tables dimmed',
  tableSelected:        'selected',
  changeTable:          'Change',
  autoAssign:           'Auto-assign',
  autoAssignSub:        'We choose the best table for you',
  chooseSelf:           'Choose table yourself',
  chooseSelfSub:        'Pick your favourite table from the floor plan',
  creditCardTitle:      'Add credit card',
  completePayment:      'Complete payment',
  reservationPending:   'Your reservation is pending. Please complete the payment now.',
  selectGuests:         'Select guests',
  overviewLabel:        'Overview',
  selectTableSubtitle:  'Would you like to choose your own table or have one automatically assigned to you?',
  tablePlanDateHint:    'Availability shown is for today — you\'ll pick your date in the next step.',

  clockSuffix:          '',
  emailPlaceholder:     'name@example.com',
  phonePlaceholder:     '+1 …',
  menuTitle:            'Menu',

  successThanks:        'Thank you',
  successReservOn:      'Your reservation on',
  successAtTime:        'at',
  successForPeople:     'for',
  successInVenue:       'at the',
  beforeReserv:         'before the reservation.',

  prevMonth:            'Previous month',
  nextMonth:            'Next month',
  guestsSelect:         'Select number of guests',
  guestsCount:          'Number of guests',
  guestsDecrease:       'Decrease guests',
  guestsIncrease:       'Increase guests',
  timeSelect:           'Select time',
  closePicker:          'Close selection',
  bookingProgress:      'Booking progress',
  pageLoading:          'Page loading',
  paymentRegion:        'Payment',
  paymentConfirm:       'Confirm payment',
  paymentCancel:        'Cancel payment',
  hintClose:            'Close notice',

  waitlistHint:         'Join the waitlist',
  waitlistFull:         'Waitlist',
  waitlistModalTitle:   'Join the waitlist',
  waitlistModalSubmit:  'Join waitlist',
  waitlistModalSuccess: 'You\'ve been added to the waitlist. We\'ll get in touch within {hours} hours if a spot opens up.',
  waitlistModalError:   'Could not join the waitlist. Please try again.',
};

const DICT: Record<WidgetLang, WidgetLabels> = { de: DE, en: EN };

@Injectable({ providedIn: 'root' })
export class WidgetI18nService {
  readonly lang = signal<WidgetLang>('de');

  readonly labels = computed<WidgetLabels>(() => DICT[this.lang()]);

  setLang(lang: WidgetLang): void {
    this.lang.set(lang);
  }

  t(): WidgetLabels {
    return DICT[this.lang()];
  }
}
