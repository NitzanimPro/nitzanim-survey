  // Stage 3 (revised): implements the external design handoff
  // (nitzanim-design-handoff.md) - navy "hero" entry/done screens, a
  // sticky topbar with segmented progress + build-mark glyph, pipeline
  // -style steps for the cascading group picker, a discrete radiogroup
  // scale instead of a native range input, and log rows for answered
  // questions. Server calls go through Api (api.js), the only module that
  // knows about the network.
  var surveyDefinition = null;
  var studentDetails = null;
  var sessionId = generateUuid_();
  var startedAt = new Date().toISOString();

  var themeGroups = null;
  var currentThemeIndex = 0;
  var answers = {};
  var responseTimes = {}; // item_id -> { time_ms, order }
  var presentationOrderCounter = 0;
  var activeItemId = null;

  var LOGO_URL = 'logo.webp';

  function generateUuid_() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }


  // ---------- Language ----------
  // The student chooses Hebrew or English once, on the entry screen, and it
  // cannot be changed afterwards (choosing English asks for confirmation
  // first, with a way back). Until then every screen is Hebrew. Group names
  // and instructor names are data and stay as written in the sheet.

  var lang = null;   // 'he' | 'en' | null until chosen

  var STRINGS = {
    brand:          { he: 'ניצנים', en: 'Nitzanim' },
    surveyName:     { he: 'שאלון חניכות.ים', en: 'Participant questionnaire' },
    pageTitle:      { he: 'שאלון חניכות.ים - ניצנים', en: 'Nitzanim - participant questionnaire' },
    loading:        { he: 'טוען את השאלון...', en: 'Loading the questionnaire...' },
    loadingHint:    { he: 'זה יכול לקחת כמה שניות.', en: 'This can take a few seconds.' },
    loadingSlow:    { he: 'הטעינה מתעכבת, מנסים שוב...', en: 'Loading is taking longer, trying again...' },
    sending:        { he: 'שולח...', en: 'Sending...' },
    sendingHint:    { he: 'נא לא לסגור את המסך עד שההודעה תופיע.', en: 'Please do not close this screen until the confirmation appears.' },
    sendingOffline: { he: 'אין חיבור לאינטרנט. השליחה תימשך אוטומטית כשהחיבור יחזור. נא לא לסגור את המסך.', en: 'No internet connection. Sending will continue automatically when the connection returns. Please do not close this screen.' },
    sendingSlow:    { he: 'החיבור איטי, מנסים שוב... נא לא לסגור את המסך.', en: 'The connection is slow, trying again... Please do not close this screen.' },
    closedTitle:    { he: 'השאלון סגור כרגע', en: 'The questionnaire is closed right now' },
    closedLead:     { he: 'אי אפשר למלא את השאלון עכשיו. אם הוא אמור להיות פתוח, פנו למדריך/ה שלכם.', en: 'The questionnaire cannot be filled in right now. If it should be open, please ask your instructor.' },
    closedStatus:   { he: 'סגור', en: 'Closed' },
    loadFailTitle:  { he: 'לא הצלחנו לטעון את השאלון', en: 'We could not load the questionnaire' },
    canRetry:       { he: 'אפשר לנסות שוב.', en: 'You can try again.' },
    retry:          { he: 'נסה שוב', en: 'Try again' },
    progressLabel:  { he: 'התקדמות בשאלון', en: 'Questionnaire progress' },
    progressText:   { he: 'נענו {n} מתוך {total} שאלות', en: '{n} of {total} questions answered' },
    entryLead:      { he: 'כמה שאלות קצרות שעוזרות לנו להכיר אותך טוב יותר. אין תשובות נכונות או לא נכונות.', en: 'A few short questions that help us get to know you better. There are no right or wrong answers.' },
    minutes:        { he: 'דקות בערך', en: 'minutes, approximately' },
    start:          { he: 'להתחלת השאלון בעברית', en: 'To start the questionnaire in English' },
    langConfirmTitle: { he: 'למלא את השאלון באנגלית?', en: 'Fill in the questionnaire in English?' },
    langConfirmLead:  { he: 'בחרת למלא את השאלון באנגלית. אחרי שממשיכים, אי אפשר לשנות את השפה.', en: 'You chose to fill in the questionnaire in English. After you continue, the language cannot be changed.' },
    langConfirmGo:    { he: 'להמשיך באנגלית', en: 'Continue in English' },
    langConfirmBack:  { he: 'חזרה לבחירת שפה', en: 'Back to language choice' },
    step1:          { he: 'שלב 1', en: 'Step 1' },
    personal:       { he: 'פרטים אישיים', en: 'Personal details' },
    idNumber:       { he: 'תעודת זהות', en: 'ID number' },
    gender:         { he: 'מגדר', en: 'Gender' },
    city:           { he: 'עיר מגורים', en: 'City of residence' },
    chooseGroup:    { he: 'בחירת קבוצה', en: 'Choose your group' },
    space:          { he: 'מרחב', en: 'Region' },
    instructor:     { he: 'מדריך', en: 'Instructor' },
    group:          { he: 'קבוצה', en: 'Group' },
    cont:           { he: 'המשך', en: 'Continue' },
    edit:           { he: 'עריכה', en: 'Edit' },
    idNotValidPassport: { he: 'מספר הזהות אינו תקין. אם הקלדת מספר דרכון במקום תעודת זהות, סמנו וי.', en: 'The ID number is not valid. If you typed a passport number instead of an ID number, tick the box.' },
    idPassportBox:  { he: 'הקלדתי מספר דרכון', en: 'I typed a passport number' },
    passportNumber: { he: 'מספר דרכון', en: 'Passport number' },
    idInvalid:      { he: 'מספר תעודת הזהות אינו תקין. יש להזין עד 9 ספרות.', en: 'The ID number is not valid. Enter up to 9 digits.' },
    genderRequired: { he: 'יש לבחור אפשרות.', en: 'Please choose an option.' },
    cityRequired:   { he: 'יש להזין עיר מגורים', en: 'Please enter your city of residence' },
    cityBadStart:   { he: 'שם העיר לא יכול להתחיל בתו = + - או @', en: 'The city name cannot start with = + - or @' },
    confirmTitle:   { he: 'אישור פרטים', en: 'Confirm details' },
    beforeContinue: { he: 'לפני שממשיכים', en: 'Before we continue' },
    checkAll:       { he: 'בודקים שהכול נכון', en: 'Please check that everything is correct' },
    cityShort:      { he: 'עיר', en: 'City' },
    noQuestionsTitle: { he: 'אין שאלות עבורך', en: 'There are no questions for you' },
    noQuestionsLead:  { he: 'בשאלון הזה אין שאלות שרלוונטיות לקבוצה שבחרת. אפשר לחזור ולבדוק את הפרטים, או לפנות למדריך/ה.', en: 'This questionnaire has no questions for the group you chose. You can go back and check your details, or ask your instructor.' },
    backToDetails:  { he: 'חזרה לפרטים', en: 'Back to details' },
    no:             { he: 'לא', en: 'No' },
    yes:            { he: 'כן', en: 'Yes' },
    ofScale:        { he: '{value} מתוך {max}', en: '{value} of {max}' },
    errTimeout:     { he: 'החיבור לשרת לקח יותר מדי זמן.', en: 'The connection to the server took too long.' },
    errNetwork:     { he: 'אין חיבור יציב לאינטרנט.', en: 'There is no stable internet connection.' },
    errClosed:      { he: 'השאלון נסגר.', en: 'The questionnaire has closed.' },
    errServer:      { he: 'השרת לא הצליח לטפל בבקשה.', en: 'The server could not handle the request.' },
    errInvalid:     { he: 'חלק מהפרטים לא נקלטו כראוי. כדאי לפנות למדריך.', en: 'Some details were not accepted. Please ask your instructor.' },
    errUnknown:     { he: 'אירעה תקלה לא צפויה.', en: 'An unexpected problem occurred.' },
    thanks:         { he: 'תודה!', en: 'Thank you!' },
    sentOk:         { he: 'התשובות שלך נשלחו בהצלחה.', en: 'Your answers were sent successfully.' },
    sentStatus:     { he: 'נשלח', en: 'Sent' },
    sendTitle:      { he: 'שליחה', en: 'Sending' },
    sendFailStatus: { he: 'השליחה נכשלה', en: 'Sending failed' },
    sendFailTitle:  { he: 'לא הצלחנו לשלוח', en: 'We could not send your answers' },
    sendFailLead:   { he: 'לא קיבלנו אישור מהשרת. ייתכן שהתשובות כבר נשמרו, ואפשר לנסות שוב בבטחה.', en: 'We did not get a confirmation from the server. Your answers may already be saved, and trying again is safe.' }
  };

  var GENDER_EN = { 'בן': 'Male', 'בת': 'Female', 'מעדיף/ה לא לציין': 'Prefer not to say' };

  // Before a language is chosen every screen is Hebrew (the English start
  // button and its confirmation screen carry their own English text).
  function t(key, vars) {
    var entry = STRINGS[key];
    var text = entry[lang || 'he'];
    if (vars) {
      Object.keys(vars).forEach(function (name) { text = text.split('{' + name + '}').join(vars[name]); });
    }
    return text;
  }

  function genderLabel_(value) {
    return lang === 'en' && GENDER_EN[value] ? GENDER_EN[value] : value;
  }

  // Question wording: English when chosen and translated, else the Hebrew original.
  function qText_(q) { return lang === 'en' && q.en_text ? q.en_text : q.text; }
  function qLow_(q) { return lang === 'en' && q.en_anchor_low ? q.en_anchor_low : q.anchor_low; }
  function qHigh_(q) { return lang === 'en' && q.en_anchor_high ? q.en_anchor_high : q.anchor_high; }

  function setLanguage_(code) {
    lang = code;
    var dir = code === 'en' ? 'ltr' : 'rtl';
    document.documentElement.lang = code;
    document.documentElement.dir = dir;
    document.body.dir = dir;
    document.title = t('pageTitle');
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadDefinition_(1);
  });

  // Loading the survey is the first thing a student sees. An occasional failure
  // or very slow answer from Google must not show an error: retry a few times
  // first, and say so on the waiting screen.
  var LOAD_MAX_ATTEMPTS = 4;

  function loadDefinition_(attempt) {
    Api.getDefinition().then(onSurveyLoaded_, function (error) {
      if (isRetryableError_(error) && attempt < LOAD_MAX_ATTEMPTS) {
        setWaitHint_(t('loadingSlow'));
        setTimeout(function () {
          loadDefinition_(attempt + 1);
        }, 2000 * attempt);
        return;
      }
      onLoadError_(error);
    });
  }

  // Every screen replaces the contents of #app, but the browser keeps the old
  // scroll position (on phones the new screen often opened half-scrolled, with
  // its header out of view). Call after replacing the screen.
  function scrollToTop_(focusKind) {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    scheduleFocus_(focusKind || 'screen');
  }

  // After a screen is drawn, move keyboard/screen-reader focus to its heading
  // (or, inside a part, to the question; at the start of a new part, to the
  // progress bar), so the change is announced instead of focus being lost with
  // the removed elements. Runs once the render finished.
  function scheduleFocus_(kind) {
    setTimeout(function () {
      var target = kind === 'question'
        ? document.querySelector('#app .nz-q__text')
        : kind === 'progress'
          ? document.querySelector('#app .nz-progress')
          : document.querySelector('#app h1, #app [role="heading"][aria-level="1"]');
      if (!target) return;
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }, 0);
  }

  var renderedThemeIndex = -1;


  function setSendingHint_(text) {
    setWaitHint_(text);
  }

  function setWaitHint_(text) {
    var hint = document.getElementById('nz-wait-hint');
    if (hint) hint.textContent = text;
  }

  // ---------- Full-screen states in the same navy style as the opening and
  // closing screens: waiting (loading / sending) and messages (closed, error).

  function buildBrandHeader_() {
    var brand = document.createElement('div');
    brand.className = 'nz-hero__brand';
    var logo = document.createElement('img');
    logo.src = LOGO_URL;
    logo.alt = t('brand');
    brand.appendChild(logo);
    var rule = document.createElement('div');
    rule.className = 'nz-hero__brand-rule';
    brand.appendChild(rule);
    return brand;
  }

  // The arrow builds itself in a loop (CSS only). It says "working", not
  // "how far along": no percentage, nothing tied to answers or to speed.
  function renderWaitScreen_(titleText, hintText) {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var hero = document.createElement('div');
    hero.className = 'nz-hero nz-hero--wait';
    hero.setAttribute('role', 'status');
    hero.appendChild(buildBrandHeader_());

    var art = document.createElement('div');
    art.className = 'nz-hero__art';
    art.appendChild(buildMark_('loading', 0));
    hero.appendChild(art);

    var title = document.createElement('h1');
    title.className = 'nz-hero__title nz-hero__title--wait';
    title.textContent = titleText;
    hero.appendChild(title);

    var hint = document.createElement('p');
    hint.className = 'nz-hero__lead';
    hint.id = 'nz-wait-hint';
    hint.textContent = hintText;
    hero.appendChild(hint);

    app.appendChild(hero);
  }

  // Shown while the final submission is in flight; it can take a while when
  // Google is slow, so it says so and asks not to close the page.
  function renderSendingScreen_() {
    renderWaitScreen_(t('sending'), t('sendingHint'));
  }

  // A message screen (survey closed, load failed, nothing to answer). The
  // outlined arrow stands for "not started"; `action` is an optional
  // { text, onClick } button.
  function renderMessageScreen_(options) {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var hero = document.createElement('div');
    hero.className = 'nz-hero';
    hero.appendChild(buildBrandHeader_());

    var art = document.createElement('div');
    art.className = 'nz-hero__art';
    art.appendChild(buildMark_('empty', 0));
    hero.appendChild(art);

    var eyebrow = document.createElement('p');
    eyebrow.className = 'nz-hero__eyebrow';
    eyebrow.textContent = t('surveyName');
    hero.appendChild(eyebrow);

    var title = document.createElement('h1');
    title.className = 'nz-hero__title nz-hero__title--message';
    title.textContent = options.title;
    hero.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'nz-hero__lead';
    lead.textContent = options.lead;
    hero.appendChild(lead);

    if (options.status) {
      var status = document.createElement('div');
      status.className = 'nz-hero__status';
      status.textContent = options.status;
      hero.appendChild(status);
    }

    if (options.action) {
      var actions = document.createElement('div');
      actions.className = 'nz-actions';
      var button = makeButton_(options.action.text, 'on-dark', options.action.icon || 'retry');
      button.addEventListener('click', options.action.onClick);
      actions.appendChild(button);
      hero.appendChild(actions);
    }

    app.appendChild(hero);
  }

  function renderClosedScreen_() {
    renderMessageScreen_({
      title: t('closedTitle'),
      lead: t('closedLead'),
      status: t('closedStatus')
    });
  }

  function onLoadError_(error) {
    renderMessageScreen_({
      title: t('loadFailTitle'),
      lead: describeError_(error) + ' ' + t('canRetry'),
      action: {
        text: t('retry'),
        onClick: function () {
          renderWaitScreen_(t('loading'), t('loadingHint'));
          loadDefinition_(1);
        }
      }
    });
  }

  function onSurveyLoaded_(definition) {
    surveyDefinition = definition;
    if (definition.activeQuestionnaire === 'closed') {
      renderClosedScreen_();
      return;
    }
    renderEntryScreen_();
  }

  // ---------- Icons (inline SVG, stroke = currentColor) ----------

  var ICONS = {
    arrow: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    retry: '<svg viewBox="0 0 24 24" fill="none"><path d="M20 11a8 8 0 10-1.5 5.5M20 5v6h-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16.5v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };

  function icon_(name) {
    var template = document.createElement('template');
    template.innerHTML = ICONS[name].trim();
    var el = template.content.firstChild;
    if (name === 'arrow') el.classList.add('nz-icon-arrow');
    return el;
  }

  function makeButton_(text, variant, iconName) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'nz-btn nz-btn--' + variant;
    var label = document.createElement('span');
    label.textContent = text;
    button.appendChild(label);
    if (iconName) button.appendChild(icon_(iconName));
    return button;
  }

  // ---------- Build mark (purely visual - reads only completed/total parts) ----------

  var BUILD_MARK_SVG =
    '<svg viewBox="-2 -2 124 84" aria-hidden="true">' +
    '<polygon points="96,24 120,24 120,56 96,56"/>' +
    '<polygon points="96,24 96,56 70,56"/>' +
    '<polygon points="70,24 96,24 70,56"/>' +
    '<polygon points="70,24 70,56 44,56"/>' +
    '<polygon points="44,24 70,24 44,56"/>' +
    '<polygon points="0,40 44,40 44,80"/>' +
    '<polygon points="0,40 44,0 44,40"/>' +
    '</svg>';

  function buildMark_(variant, filledCount) {
    var template = document.createElement('template');
    template.innerHTML = BUILD_MARK_SVG.trim();
    var svg = template.content.firstChild;
    svg.classList.add('nz-build');
    if (variant === 'empty') svg.classList.add('nz-build--empty');
    if (variant === 'complete') svg.classList.add('nz-build--complete');
    if (variant === 'loading') svg.classList.add('nz-build--loading');
    var polygons = svg.querySelectorAll('polygon');
    for (var i = 0; i < polygons.length && i < filledCount; i++) {
      polygons[i].classList.add('is-filled');
    }
    return svg;
  }

  // ---------- Progress segments (one per part) ----------

  // answeredCount / totalCount (optional) feed the screen-reader description
  // only; the visual bar is unchanged.
  function renderProgressSegments_(totalSegments, currentIndex, currentFractionPct, answeredCount, totalCount) {
    var progress = document.createElement('div');
    progress.className = 'nz-progress';
    if (totalCount) {
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', t('progressLabel'));
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', String(totalCount));
      progress.setAttribute('aria-valuenow', String(answeredCount));
      progress.setAttribute('aria-valuetext', t('progressText', { n: answeredCount, total: totalCount }));
    }
    for (var i = 0; i < totalSegments; i++) {
      var seg = document.createElement('div');
      seg.className = 'nz-progress__seg';
      var fill = document.createElement('div');
      fill.className = 'nz-progress__fill';
      var pct = 0;
      if (i < currentIndex) pct = 100;
      else if (i === currentIndex) pct = currentFractionPct;
      fill.style.width = pct + '%';
      seg.appendChild(fill);
      progress.appendChild(seg);
    }
    return progress;
  }

  // ---------- Israeli id_number validation ----------

  function padIdNumber_(rawValue) {
    var digitsOnly = String(rawValue || '').trim();
    while (digitsOnly.length < 9) digitsOnly = '0' + digitsOnly;
    return digitsOnly;
  }

  // The identifier a student types: an Israeli ID number or a passport number.
  // Same rule as the server (Validation.js, parseIdentifier_): 1-9 digits with a
  // valid check digit is an ID; 5-20 letters/digits with a digit, or 10-20 digits,
  // is a passport; 5-9 digits that fail the check digit are a passport only when
  // the student ticked the passport box. Spaces and hyphens are ignored.
  function parseIdentifier_(rawValue, passportConfirmed) {
    var text = String(rawValue || '').trim().replace(/[\s-]+/g, '');
    if (/^\d{1,9}$/.test(text)) {
      if (isValidIsraeliId_(text)) return { value: padIdNumber_(text), type: 'id' };
      if (passportConfirmed === true && text.length >= 5) return { value: text, type: 'passport' };
      return null;
    }
    if (/^[A-Za-z0-9]{5,20}$/.test(text) && /\d/.test(text)) {
      return { value: text.toUpperCase(), type: 'passport' };
    }
    return null;
  }

  // Digits only, 5-9 of them, and not a valid ID: the case where the passport box is offered.
  function looksLikeNumericPassport_(rawValue) {
    var text = String(rawValue || '').trim().replace(/[\s-]+/g, '');
    return /^\d{5,9}$/.test(text) && !isValidIsraeliId_(text);
  }

  function isValidIsraeliId_(rawValue) {
    var digitsOnly = String(rawValue || '').trim();
    if (!/^\d{1,9}$/.test(digitsOnly)) return false;
    var padded = padIdNumber_(digitsOnly);
    var sum = 0;
    for (var i = 0; i < 9; i++) {
      var digit = Number(padded[i]);
      var product = digit * ((i % 2 === 0) ? 1 : 2);
      if (product > 9) product -= 9;
      sum += product;
    }
    return sum % 10 === 0;
  }

  // ---------- Entry screen ----------

  function estimateMinutes_() {
    var secondsPerItem = 12;
    var minutes = Math.ceil((surveyDefinition.questions.length * secondsPerItem) / 60);
    return Math.max(minutes, 3);
  }

  function renderEntryScreen_() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var hero = document.createElement('div');
    hero.className = 'nz-hero nz-hero--entry';

    var brand = document.createElement('div');
    brand.className = 'nz-hero__brand';
    var logo = document.createElement('img');
    logo.src = LOGO_URL;
    logo.alt = t('brand');
    brand.appendChild(logo);
    var rule = document.createElement('div');
    rule.className = 'nz-hero__brand-rule';
    brand.appendChild(rule);
    hero.appendChild(brand);

    var art = document.createElement('div');
    art.className = 'nz-hero__art';
    art.appendChild(buildMark_('empty', 0));
    hero.appendChild(art);

    var eyebrow = document.createElement('p');
    eyebrow.className = 'nz-hero__eyebrow';
    eyebrow.textContent = t('surveyName');
    hero.appendChild(eyebrow);

    var title = document.createElement('h1');
    title.className = 'nz-hero__title';
    title.textContent = t('brand');
    hero.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'nz-hero__lead';
    lead.textContent = t('entryLead');
    hero.appendChild(lead);

    // The same sentence in English, aligned to the left
    var leadEn = document.createElement('p');
    leadEn.className = 'nz-hero__lead nz-hero__lead--en';
    leadEn.lang = 'en';
    leadEn.dir = 'ltr';
    leadEn.textContent = STRINGS.entryLead.en;
    hero.appendChild(leadEn);

    var timeRow = document.createElement('div');
    timeRow.className = 'nz-hero__time';
    var strong = document.createElement('strong');
    strong.textContent = estimateMinutes_();
    timeRow.appendChild(strong);
    var timeLabel = document.createElement('span');
    timeLabel.textContent = t('minutes');
    timeRow.appendChild(timeLabel);
    hero.appendChild(timeRow);

    var actions = document.createElement('div');
    actions.className = 'nz-actions nz-actions--stack';
    // Choosing a start button chooses the language for the whole questionnaire;
    // there is no way back to this screen, so it cannot be changed later.
    [{ code: 'he', label: STRINGS.start.he }, { code: 'en', label: STRINGS.start.en }].forEach(function (option) {
      var startButton = makeButton_(option.label, option.code === 'he' ? 'on-dark' : 'secondary-dark', 'arrow');
      startButton.lang = option.code;
      startButton.dir = option.code === 'en' ? 'ltr' : 'rtl';
      startButton.addEventListener('click', function () {
        if (option.code === 'en') {
          renderEnglishConfirmScreen_();
        } else {
          setLanguage_('he');
          renderDetailsStep_();
        }
      });
      actions.appendChild(startButton);
    });
    hero.appendChild(actions);

    app.appendChild(hero);
  }

  // Asked before English is locked in: the student may have tapped the wrong
  // button. The text is in English with a Hebrew line, so either reader can
  // follow it; "Back to Hebrew" returns to the entry screen.
  function renderEnglishConfirmScreen_() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var hero = document.createElement('div');
    hero.className = 'nz-hero nz-hero--entry';
    hero.appendChild(buildBrandHeader_());

    var art = document.createElement('div');
    art.className = 'nz-hero__art';
    art.appendChild(buildMark_('empty', 0));
    hero.appendChild(art);

    function block(tag, className, entryKey, code) {
      var el = document.createElement(tag);
      el.className = className;
      el.lang = code;
      el.dir = code === 'en' ? 'ltr' : 'rtl';
      el.textContent = STRINGS[entryKey][code];
      return el;
    }
    hero.appendChild(block('h1', 'nz-hero__title nz-hero__title--message', 'langConfirmTitle', 'en'));
    hero.appendChild(block('p', 'nz-hero__lead', 'langConfirmLead', 'en'));
    hero.appendChild(block('p', 'nz-hero__lead', 'langConfirmLead', 'he'));

    var actions = document.createElement('div');
    actions.className = 'nz-actions nz-actions--row';
    var goButton = makeButton_(STRINGS.langConfirmGo.en, 'on-dark', 'arrow');
    goButton.lang = 'en';
    goButton.dir = 'ltr';
    goButton.addEventListener('click', function () {
      setLanguage_('en');
      renderDetailsStep_();
    });
    var backButton = makeButton_(STRINGS.langConfirmBack.he, 'secondary-dark');
    backButton.lang = 'he';
    backButton.addEventListener('click', renderEntryScreen_);
    actions.appendChild(goButton);
    actions.appendChild(backButton);
    hero.appendChild(actions);

    app.appendChild(hero);
  }

  // ---------- Details step ----------

  function renderDetailsStep_() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var eyebrow = document.createElement('div');
    eyebrow.className = 'nz-topbar__eyebrow';
    eyebrow.textContent = t('step1');
    var titleWrap = document.createElement('div');
    titleWrap.appendChild(eyebrow);
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '1');
    title.textContent = t('personal');
    titleWrap.appendChild(title);
    row.appendChild(titleWrap);
    topbar.appendChild(row);
    topbar.appendChild(renderProgressSegments_(surveyDefinition.themes.length, -1, 0));
    app.appendChild(topbar);

    var main = document.createElement('div');
    main.className = 'nz-main';

    var form = document.createElement('form');
    form.id = 'detailsForm';

    var idField = makeLabeledInput_('id_number', t('idNumber'), true);
    var idError = document.createElement('div');
    idError.id = 'id_number_error';
    idError.className = 'nz-error';
    // announced when it appears, and tied to the field for screen readers
    idError.setAttribute('role', 'alert');
    var idInputEl = idField.querySelector('#id_number');
    idInputEl.setAttribute('aria-describedby', 'id_number_error');
    idInputEl.setAttribute('autocomplete', 'off');
    idInputEl.setAttribute('autocapitalize', 'characters');
    idInputEl.setAttribute('spellcheck', 'false');
    idInputEl.maxLength = 30;
    idField.appendChild(idError);

    // Offered only after a number of digits fails the ID check digit: a passport
    // made of digits only cannot be told apart from a mistyped ID otherwise.
    var passportBox = document.createElement('div');
    passportBox.className = 'nz-check';
    passportBox.hidden = true;
    var passportCheckbox = document.createElement('input');
    passportCheckbox.type = 'checkbox';
    passportCheckbox.id = 'id_is_passport';
    var passportLabel = document.createElement('label');
    passportLabel.setAttribute('for', 'id_is_passport');
    passportLabel.textContent = t('idPassportBox');
    passportBox.appendChild(passportCheckbox);
    passportBox.appendChild(passportLabel);
    idField.appendChild(passportBox);
    form.appendChild(idField);

    form.appendChild(makeSegmented_('gender', t('gender'), surveyDefinition.settingsLists.gender));
    var genderError = document.createElement('div');
    genderError.id = 'gender_error';
    genderError.className = 'nz-error';
    genderError.setAttribute('role', 'alert');
    form.lastChild.appendChild(genderError);
    form.lastChild.querySelector('#gender').setAttribute('aria-describedby', 'gender_error');

    if (surveyDefinition.collectCity) {
      var cityField = makeLabeledInput_('city', t('city'), false);
      cityField.querySelector('#city').maxLength = 60;   // the server refuses longer values
      form.appendChild(cityField);
    }

    var divider = document.createElement('hr');
    divider.className = 'nz-divider';
    form.appendChild(divider);

    var stepsHeading = document.createElement('h2');
    stepsHeading.className = 'nz-section-heading';
    stepsHeading.textContent = t('chooseGroup');
    form.appendChild(stepsHeading);

    appendGroupSteps_(form);

    if (studentDetails) {
      prefillDetailsForm_(form);
    }

    var actions = document.createElement('div');
    actions.className = 'nz-actions';
    var submitButton = makeButton_(t('cont'), 'primary', 'arrow');
    submitButton.type = 'submit';
    actions.appendChild(submitButton);
    form.appendChild(actions);

    var idInput = form.querySelector('#id_number');
    var idTouched = !!studentDetails;   // an edited form was already filled in
    function refreshSubmitState_() {
      // Offer the passport box once nine digits were typed, or when the field is left.
      var digitsLength = idInput.value.trim().replace(/[\s-]+/g, '').length;
      var offerBox = looksLikeNumericPassport_(idInput.value) && (digitsLength === 9 || idTouched);
      passportBox.hidden = !offerBox;
      if (!offerBox) passportCheckbox.checked = false;
      idError.textContent = offerBox && !passportCheckbox.checked ? t('idNotValidPassport') : '';
      submitButton.disabled = !parseIdentifier_(idInput.value, passportCheckbox.checked);
    }
    idInput.addEventListener('input', refreshSubmitState_);
    idInput.addEventListener('blur', function () { idTouched = true; refreshSubmitState_(); });
    passportCheckbox.addEventListener('change', refreshSubmitState_);
    if (studentDetails && studentDetails.idIsPassport) passportCheckbox.checked = true;
    refreshSubmitState_();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      handleDetailsSubmit_(form);
    });

    main.appendChild(form);
    app.appendChild(main);
  }

  function appendGroupSteps_(container) {
    var stepsWrap = document.createElement('div');
    stepsWrap.className = 'nz-steps';

    var spaces = uniqueValues_(surveyDefinition.groups.map(function (g) { return g.space; }));

    var spaceSelect = document.createElement('select');
    spaceSelect.id = 'space';
    spaceSelect.name = 'space';
    spaceSelect.className = 'nz-select';
    setSelectOptions_(spaceSelect, spaces, spaces);

    var instructorSelect = document.createElement('select');
    instructorSelect.id = 'instructor';
    instructorSelect.name = 'instructor';
    instructorSelect.className = 'nz-select';

    var groupSelect = document.createElement('select');
    groupSelect.id = 'group_id';
    groupSelect.name = 'group_id';
    groupSelect.className = 'nz-select';

    stepsWrap.appendChild(makeStepField_('01', t('space'), spaceSelect, 'done'));
    stepsWrap.appendChild(makeStepField_('02', t('instructor'), instructorSelect, 'done'));
    stepsWrap.appendChild(makeStepField_('03', t('group'), groupSelect, 'active'));

    container.appendChild(stepsWrap);

    spaceSelect.addEventListener('change', function () {
      populateInstructorOptions_(instructorSelect, spaceSelect.value);
      populateGroupOptions_(groupSelect, spaceSelect.value, instructorSelect.value);
    });
    instructorSelect.addEventListener('change', function () {
      populateGroupOptions_(groupSelect, spaceSelect.value, instructorSelect.value);
    });

    if (spaceSelect.value) {
      populateInstructorOptions_(instructorSelect, spaceSelect.value);
      populateGroupOptions_(groupSelect, spaceSelect.value, instructorSelect.value);
    }
  }

  function makeStepField_(num, labelText, controlEl, state) {
    var step = document.createElement('div');
    step.className = 'nz-step nz-step--' + state;

    var rail = document.createElement('div');
    rail.className = 'nz-step__rail';
    var node = document.createElement('div');
    node.className = 'nz-step__node';
    if (state === 'done') node.appendChild(icon_('check'));
    if (state === 'locked') node.appendChild(icon_('lock'));
    rail.appendChild(node);
    step.appendChild(rail);

    var body = document.createElement('div');
    body.className = 'nz-step__body';
    var label = document.createElement('label');
    label.className = 'nz-label';
    label.setAttribute('for', controlEl.id);
    var numSpan = document.createElement('span');
    numSpan.className = 'nz-step__num nz-mono';
    numSpan.textContent = num;
    label.appendChild(numSpan);
    label.appendChild(document.createTextNode(labelText));
    body.appendChild(label);
    body.appendChild(controlEl);
    step.appendChild(body);

    return step;
  }

  function populateInstructorOptions_(instructorSelect, space) {
    var instructors = uniqueValues_(
      surveyDefinition.groups
        .filter(function (g) { return g.space === space; })
        .map(function (g) { return g.instructor; })
    );
    setSelectOptions_(instructorSelect, instructors, instructors);
  }

  function populateGroupOptions_(groupSelect, space, instructor) {
    var groups = surveyDefinition.groups.filter(function (g) {
      return g.space === space && g.instructor === instructor;
    });
    setSelectOptions_(groupSelect, groups.map(function (g) { return g.group_id; }), groups.map(formatGroupLabel_));
    groupSelect.disabled = groups.length === 1;
  }

  function formatGroupLabel_(group) {
    var parts = [group.class];
    if (group.major) parts.push(group.major);
    if (group.group_label) parts.push(group.group_label);
    return parts.join(' - ');
  }

  function setSelectOptions_(selectEl, values, labels) {
    selectEl.innerHTML = '';
    values.forEach(function (value, i) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = labels[i];
      selectEl.appendChild(option);
    });
  }

  function uniqueValues_(values) {
    var seen = {};
    var result = [];
    values.forEach(function (value) {
      if (!seen[value]) {
        seen[value] = true;
        result.push(value);
      }
    });
    return result;
  }

  // ---------- Segmented control (used for gender) ----------

  // Radio-group keyboard behaviour for a row of buttons with role=radio: arrow
  // keys move to the neighbouring option and choose it. In a right-to-left
  // page the left arrow goes to the next option, in a left-to-right page the right arrow.
  function enableRadioArrows_(buttons) {
    buttons.forEach(function (button, index) {
      button.addEventListener('keydown', function (event) {
        var target = null;
        var rtl = document.documentElement.dir !== 'ltr';
        var nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
        var prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
        if (event.key === nextKey || event.key === 'ArrowDown') target = buttons[index + 1];
        else if (event.key === prevKey || event.key === 'ArrowUp') target = buttons[index - 1];
        else if (event.key === 'Home') target = buttons[0];
        else if (event.key === 'End') target = buttons[buttons.length - 1];
        else return;
        event.preventDefault();
        if (target) {
          target.focus();
          target.click();
        }
      });
    });
  }

  function makeSegmented_(id, labelText, options) {
    var field = document.createElement('div');
    field.className = 'nz-field';
    var label = document.createElement('label');
    label.className = 'nz-label';
    label.textContent = labelText;
    field.appendChild(label);

    var group = document.createElement('div');
    group.className = 'nz-segmented';
    group.id = id;
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', labelText);

    options.forEach(function (optionText, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.textContent = genderLabel_(optionText);
      // No default: a student who skips the field must not be recorded as the first option.
      btn.setAttribute('aria-checked', 'false');
      btn.dataset.value = optionText;
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(group.children, function (b) { b.setAttribute('aria-checked', 'false'); });
        btn.setAttribute('aria-checked', 'true');
        var error = document.getElementById(id + '_error');
        if (error) error.textContent = '';
        group.removeAttribute('aria-invalid');
      });
      group.appendChild(btn);
    });
    enableRadioArrows_(Array.prototype.slice.call(group.children));

    field.appendChild(group);
    return field;
  }

  function getSegmentedValue_(groupEl) {
    var pressed = groupEl.querySelector('[aria-checked="true"]');
    return pressed ? pressed.dataset.value : null;
  }

  function setSegmentedValue_(groupEl, value) {
    Array.prototype.forEach.call(groupEl.children, function (b) {
      b.setAttribute('aria-checked', b.dataset.value === value ? 'true' : 'false');
    });
  }

  function handleDetailsSubmit_(form) {
    var idInput = form.querySelector('#id_number');
    var idNumberRaw = idInput.value;
    var idError = document.getElementById('id_number_error');
    idError.textContent = '';
    idInput.removeAttribute('aria-invalid');

    var passportChecked = form.querySelector('#id_is_passport').checked;
    var identifier = parseIdentifier_(idNumberRaw, passportChecked);
    if (!identifier) {
      idError.textContent = t('idInvalid');
      idInput.setAttribute('aria-invalid', 'true');
      return;
    }

    var genderGroup = form.querySelector('#gender');
    if (getSegmentedValue_(genderGroup) === null) {
      document.getElementById('gender_error').textContent = t('genderRequired');
      genderGroup.setAttribute('aria-invalid', 'true');
      genderGroup.querySelector('button').focus();
      return;
    }

    if (surveyDefinition.collectCity) {
      var cityInput = form.querySelector('#city');
      var cityValue = cityInput.value.trim();
      // Same rule as the server: a value starting with = + - @ would be stored as
      // a formula in the sheet, so it is refused there; say so here, at once.
      var cityProblem = !cityValue ? t('cityRequired')
        : (/^[=+\-@]/.test(cityValue) || /[\u0000-\u001f\u007f]/.test(cityValue)) ? t('cityBadStart')
        : '';
      if (cityProblem) {
        cityInput.setCustomValidity(cityProblem);
        cityInput.reportValidity();
        cityInput.addEventListener('input', function () {
          cityInput.setCustomValidity('');
        }, { once: true });
        return;
      }
    }

    // Disabled selects are excluded from FormData entirely, so a locked
    // single-option group select (see populateGroupOptions_) must be read
    // directly from the element.
    var groupId = form.querySelector('#group_id').value;
    var group = surveyDefinition.groups.filter(function (g) {
      return g.group_id === groupId;
    })[0];

    var districtEntry = surveyDefinition.settingsLists.spaceDistrict.filter(function (sd) {
      return sd.space === group.space;
    })[0];

    studentDetails = {
      id_number: identifier.value,
      idType: identifier.type,
      idIsPassport: passportChecked && identifier.type === 'passport',
      gender: getSegmentedValue_(document.getElementById('gender')),
      city: surveyDefinition.collectCity ? form.querySelector('#city').value.trim() : '',
      group_id: group.group_id,
      district: districtEntry ? districtEntry.district : '',
      space: group.space,
      instructor: group.instructor,
      class: group.class,
      major: group.major || '',
      groupLabel: formatGroupLabel_(group)
    };

    renderConfirmStep_();
  }

  function prefillDetailsForm_(form) {
    form.querySelector('#id_number').value = studentDetails.id_number;
    // The form is not attached to the document yet, so look inside it.
    setSegmentedValue_(form.querySelector('#gender'), studentDetails.gender);
    if (surveyDefinition.collectCity) {
      form.querySelector('#city').value = studentDetails.city;
    }
    form.querySelector('#space').value = studentDetails.space;
    populateInstructorOptions_(form.querySelector('#instructor'), studentDetails.space);
    form.querySelector('#instructor').value = studentDetails.instructor;
    populateGroupOptions_(form.querySelector('#group_id'), studentDetails.space, studentDetails.instructor);
    form.querySelector('#group_id').value = studentDetails.group_id;
  }

  // ---------- Confirmation step ----------

  function renderConfirmStep_() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '1');
    title.textContent = t('confirmTitle');
    row.appendChild(title);
    topbar.appendChild(row);
    topbar.appendChild(renderProgressSegments_(surveyDefinition.themes.length, -1, 0));
    app.appendChild(topbar);

    var main = document.createElement('div');
    main.className = 'nz-main';

    var title2 = document.createElement('h1');
    title2.className = 'nz-h1';
    title2.textContent = t('beforeContinue');
    main.appendChild(title2);

    var subLine = document.createElement('p');
    subLine.className = 'nz-subline';
    subLine.textContent = t('checkAll');
    main.appendChild(subLine);

    var dl = document.createElement('dl');
    dl.className = 'nz-summary';

    function addRow(term, value) {
      var rowEl = document.createElement('div');
      rowEl.className = 'nz-summary__row';
      var dt = document.createElement('dt');
      dt.textContent = term;
      var dd = document.createElement('dd');
      dd.textContent = value || '—';
      if (!value) dd.classList.add('is-empty');
      rowEl.appendChild(dt);
      rowEl.appendChild(dd);
      dl.appendChild(rowEl);
    }

    addRow(t(studentDetails.idType === 'passport' ? 'passportNumber' : 'idNumber'), studentDetails.id_number);
    addRow(t('gender'), genderLabel_(studentDetails.gender));
    if (surveyDefinition.collectCity) {
      addRow(t('cityShort'), studentDetails.city);
    }
    addRow(t('group'), studentDetails.groupLabel + ' (' + studentDetails.instructor + ')');

    main.appendChild(dl);

    var actions = document.createElement('div');
    actions.className = 'nz-actions';

    var continueButton = makeButton_(t('cont'), 'primary', 'arrow');
    continueButton.addEventListener('click', startThemeFlow_);
    actions.appendChild(continueButton);

    var editButton = makeButton_(t('edit'), 'secondary', 'edit');
    editButton.addEventListener('click', renderDetailsStep_);
    actions.appendChild(editButton);

    main.appendChild(actions);
    app.appendChild(main);
  }

  // ---------- Theme flow: reveal/fold questions + discrete scale ----------

  // Same rule as the server: class names are compared without geresh,
  // gershayim, quotes or spaces, so a typing variant never hides questions.
  function normalizeClassName_(name) {
    return String(name == null ? '' : name).replace(/[\s'"`\u05F3\u05F4\u2018\u2019\u201C\u201D]/g, '');
  }

  function filterQuestionsForClass_(questions, studentClass) {
    return questions.filter(function (q) {
      if (!q.classes || String(q.classes).trim() === 'all') return true;
      var wanted = normalizeClassName_(studentClass);
      return String(q.classes).split(',').some(function (c) { return normalizeClassName_(c) === wanted; });
    });
  }

  function groupQuestionsByTheme_(questions, themes) {
    var groups = [];
    themes.forEach(function (theme) {
      var themeQuestions = questions
        .filter(function (q) { return q.theme_id === theme.theme_id; })
        .sort(function (a, b) { return a.order - b.order; });
      if (themeQuestions.length > 0) {
        groups.push({ theme_id: theme.theme_id, questions: themeQuestions });
      }
    });
    return groups;
  }

  function shuffleArray_(array) {
    for (var i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  function startThemeFlow_() {
    var relevantQuestions = filterQuestionsForClass_(surveyDefinition.questions, studentDetails.class);
    themeGroups = groupQuestionsByTheme_(relevantQuestions, surveyDefinition.themes);
    if (surveyDefinition.shuffleItems) {
      themeGroups.forEach(function (group) { shuffleArray_(group.questions); });
    }
    currentThemeIndex = 0;
    answers = {};
    responseTimes = {};
    presentationOrderCounter = 0;
    activeItemId = null;

    if (themeGroups.length === 0) {
      renderMessageScreen_({
        title: t('noQuestionsTitle'),
        lead: t('noQuestionsLead'),
        action: { text: t('backToDetails'), icon: 'edit', onClick: renderDetailsStep_ }
      });
      return;
    }
    renderThemeStep_();
  }

  function getFrontierItemId_(themeQuestions) {
    for (var i = 0; i < themeQuestions.length; i++) {
      if (!(themeQuestions[i].item_id in answers)) return themeQuestions[i].item_id;
    }
    return null;
  }

  function renderThemeStep_() {
    var theme = themeGroups[currentThemeIndex];

    if (activeItemId === null) {
      activeItemId = getFrontierItemId_(theme.questions);
    }
    if (activeItemId === null) {
      advanceToNextThemeOrFinish_();
      return;
    }

    var app = document.getElementById('app');
    app.innerHTML = '';
    // Re-rendering this screen also happens on every question reveal/fold,
    // where the page should stay put; only a new theme starts at the top.
    var newTheme = renderedThemeIndex !== currentThemeIndex;
    if (newTheme) {
      renderedThemeIndex = currentThemeIndex;
      scrollToTop_('progress');
    }

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row nz-topbar__row--end';
    var facetsFilled = Math.round((currentThemeIndex / themeGroups.length) * 7);
    var smallMark = buildMark_(null, facetsFilled);
    smallMark.style.width = '48px';
    smallMark.style.height = '32px';
    row.appendChild(smallMark);
    topbar.appendChild(row);

    var answeredInTheme = theme.questions.filter(function (q) { return q.item_id in answers; }).length;
    var currentFractionPct = Math.round((answeredInTheme / theme.questions.length) * 100);
    var totalItems = themeGroups.reduce(function (sum, t) { return sum + t.questions.length; }, 0);
    var answeredItems = Object.keys(answers).length;
    topbar.appendChild(renderProgressSegments_(themeGroups.length, currentThemeIndex, currentFractionPct, answeredItems, totalItems));

    app.appendChild(topbar);

    // Only the current question is shown; answered ones are not displayed
    // and cannot be reopened (no going back).
    var main = document.createElement('div');
    main.className = 'nz-main';
    var activeIndex = 0;
    for (var i = 0; i < theme.questions.length; i++) {
      if (theme.questions[i].item_id === activeItemId) { activeIndex = i; break; }
    }
    main.appendChild(renderActiveQuestion_(theme.questions[activeIndex]));
    app.appendChild(main);
    if (!newTheme) scheduleFocus_('question');
  }

  // Yes/no item: two buttons, no = 1 (right, where 1 sits on the scale) and
  // yes = scale_max (left, where the top of the scale sits).
  function renderYesNo_(question, existingValue, onSelect) {
    var scaleMax = surveyDefinition.scaleMax;
    var group = document.createElement('div');
    group.className = 'nz-segmented nz-segmented--choice';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', qText_(question));
    var buttons = [];
    [{ label: t('no'), value: 1 }, { label: t('yes'), value: scaleMax }].forEach(function (option) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.textContent = option.label;
      btn.setAttribute('aria-checked', existingValue === option.value ? 'true' : 'false');
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-checked', 'false'); });
        btn.setAttribute('aria-checked', 'true');
        onSelect(option.value);
      });
      buttons.push(btn);
      group.appendChild(btn);
    });
    enableRadioArrows_(buttons);
    return group;
  }

  function renderActiveQuestion_(question) {
    var wrapper = document.createElement('div');
    wrapper.className = 'nz-q';

    var body = document.createElement('div');
    body.className = 'nz-q__body';

    var questionText = document.createElement('p');
    questionText.className = 'nz-q__text';
    questionText.setAttribute('role', 'heading');
    questionText.setAttribute('aria-level', '1');
    questionText.textContent = qText_(question);
    body.appendChild(questionText);

    // Response time is measured only the first time a question is shown -
    // re-rendering the same question doesn't restart the clock or claim
    // another presentation-order slot.
    var isFirstReveal = !(question.item_id in responseTimes);
    var revealedAt = isFirstReveal ? Date.now() : null;
    var revealOrder = isFirstReveal ? ++presentationOrderCounter : null;
    var existingValue = answers[question.item_id];
    var selectedValue = existingValue;

    var continueButton = makeButton_(t('cont'), 'primary', 'arrow');
    continueButton.disabled = existingValue === undefined;

    if (question.type === 'yesno') {
      body.appendChild(renderYesNo_(question, existingValue, function (value) {
        selectedValue = value;
        continueButton.disabled = false;
      }));
    } else {
      var scale = document.createElement('div');
      scale.className = 'nz-scale';

      var track = document.createElement('div');
      track.className = 'nz-scale__track';
      track.setAttribute('role', 'radiogroup');
      track.setAttribute('aria-label', qText_(question));

      var nums = document.createElement('div');
      nums.className = 'nz-scale__nums';

      var stopButtons = [];
      var numSpans = [];
      var scaleMax = surveyDefinition.scaleMax;
      scale.style.setProperty('--nz-n', scaleMax);
      for (var value = 1; value <= scaleMax; value++) {
        (function (value) {
          var stop = document.createElement('button');
          stop.type = 'button';
          stop.className = 'nz-stop';
          stop.setAttribute('role', 'radio');
          var isChecked = existingValue === value;
          stop.setAttribute('aria-checked', isChecked ? 'true' : 'false');
          var ariaLabel = t('ofScale', { value: value, max: scaleMax });
          if (value === 1) ariaLabel += ', ' + qLow_(question);
          if (value === scaleMax) ariaLabel += ', ' + qHigh_(question);
          stop.setAttribute('aria-label', ariaLabel);
          stop.addEventListener('click', function () {
            stopButtons.forEach(function (b) { b.setAttribute('aria-checked', 'false'); });
            stop.setAttribute('aria-checked', 'true');
            numSpans.forEach(function (n) { n.classList.remove('is-selected'); });
            numSpans[value - 1].classList.add('is-selected');
            selectedValue = value;
            continueButton.disabled = false;
          });
          stopButtons.push(stop);
          track.appendChild(stop);

          var numSpan = document.createElement('span');
          numSpan.textContent = value;
          if (isChecked) numSpan.classList.add('is-selected');
          numSpans.push(numSpan);
          nums.appendChild(numSpan);
        })(value);
      }

      enableRadioArrows_(stopButtons);
      scale.appendChild(track);
      scale.appendChild(nums);

      var anchors = document.createElement('div');
      anchors.className = 'nz-scale__anchors';
      var lowAnchor = document.createElement('span');
      lowAnchor.textContent = qLow_(question);
      var highAnchor = document.createElement('span');
      highAnchor.textContent = qHigh_(question);
      anchors.appendChild(lowAnchor);
      anchors.appendChild(highAnchor);
      scale.appendChild(anchors);

      body.appendChild(scale);
    }

    var actions = document.createElement('div');
    actions.className = 'nz-actions';
    continueButton.addEventListener('click', function () {
      answers[question.item_id] = selectedValue;
      if (isFirstReveal) {
        responseTimes[question.item_id] = { time_ms: Date.now() - revealedAt, order: revealOrder };
      }
      activeItemId = null;
      renderThemeStep_();
    });
    actions.appendChild(continueButton);
    body.appendChild(actions);

    wrapper.appendChild(body);
    return wrapper;
  }

  function advanceToNextThemeOrFinish_() {
    var completedTheme = themeGroups[currentThemeIndex];
    if (currentThemeIndex < themeGroups.length - 1) {
      saveCheckpointWithRetry_(completedTheme.theme_id);
      currentThemeIndex++;
      activeItemId = null;
      renderThemeStep_();
    } else {
      submitFinalAnswers_(completedTheme.theme_id);
    }
  }

  function buildProgressPayload_(lastThemeCompleted) {
    return {
      session_id: sessionId,
      started_at: startedAt,
      id_number: studentDetails.id_number,
      id_is_passport: studentDetails.idIsPassport === true,
      gender: studentDetails.gender,
      city: studentDetails.city,
      group_id: studentDetails.group_id,
      district: studentDetails.district,
      space: studentDetails.space,
      instructor: studentDetails.instructor,
      class: studentDetails.class,
      major: studentDetails.major,
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      language: lang || 'he',
      answers: answers,
      responseTimes: responseTimes,
      last_theme_completed: lastThemeCompleted || ''
    };
  }

  // Checkpoint saves never block the UI and never bother the student on
  // failure - answers stay safe in memory regardless, and the flow keeps
  // moving forward. Retries silently with backoff, then gives up quietly;
  // only a failed FINAL submission is ever shown to the student.
  // A whole class finishes a theme at about the same moment; spreading the
  // first send over a few seconds keeps them from queueing on the server's
  // write lock. Invisible to the student (the screen has already moved on).
  var CHECKPOINT_JITTER_MS = 5000;

  function saveCheckpointWithRetry_(lastThemeCompleted, attempt) {
    if (!attempt) {
      lastThemeCompletedSoFar = lastThemeCompleted;
      setTimeout(function () {
        if (!finalSubmitted) saveCheckpointWithRetry_(lastThemeCompleted, 1);
      }, Math.random() * CHECKPOINT_JITTER_MS);
      return;
    }
    var payload = buildProgressPayload_(lastThemeCompleted);
    var sent = trackSend_(payload);
    saveInFlight++;
    Api.saveCheckpoint(payload).then(function () {
      saveInFlight--;
      markSaved_(sent);
    }, function (error) {
      saveInFlight--;
      // Only transport problems are worth retrying; a rejection by the
      // server (e.g. the survey was closed) would just repeat.
      if (attempt < 5 && !finalSubmitted && isRetryableError_(error)) {
        setTimeout(function () {
          saveCheckpointWithRetry_(lastThemeCompleted, attempt + 1);
        }, 3000 * attempt);
      }
    });
  }

  // ---------- Unsaved answers (drives the beforeunload warning) ----------
  // Each send is numbered; a late success of an OLDER send (after retries)
  // must not mark newer answers as saved.
  var sendCounter = 0;
  var savedSendNumber = 0;
  var savedSnapshot = '';
  var finalSubmitted = false;

  function trackSend_(payload) {
    sendCounter++;
    return { number: sendCounter, snapshot: JSON.stringify(payload.answers) };
  }

  function markSaved_(sent) {
    if (sent.number > savedSendNumber) {
      savedSendNumber = sent.number;
      savedSnapshot = sent.snapshot;
    }
  }

  function hasUnsavedAnswers_() {
    if (finalSubmitted) return false;
    var current = JSON.stringify(answers);
    return current !== '{}' && current !== savedSnapshot;
  }

  window.addEventListener('beforeunload', function (event) {
    if (!hasUnsavedAnswers_()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // ---------- Last-chance save ----------
  // Mobile browsers rarely show the beforeunload warning, so when the page is
  // hidden or closed with unsaved answers, send one best-effort checkpoint.
  // Guarded to keep server load low: only with unsaved answers, never while
  // another save is in flight, and at most once per EXIT_SAVE_MIN_INTERVAL_MS
  // (app switches and screen locks can fire this event repeatedly). The
  // server upserts by session_id, so this never duplicates a row or
  // overwrites a completed one.
  var EXIT_SAVE_MIN_INTERVAL_MS = 30000;
  var lastExitSaveAt = 0;
  var saveInFlight = 0;
  var lastThemeCompletedSoFar = '';

  function saveOnExit_() {
    if (!studentDetails || !hasUnsavedAnswers_() || saveInFlight > 0) return;
    var now = Date.now();
    if (now - lastExitSaveAt < EXIT_SAVE_MIN_INTERVAL_MS) return;
    lastExitSaveAt = now;

    var payload = buildProgressPayload_(lastThemeCompletedSoFar);
    var sent = trackSend_(payload);
    Api.saveCheckpointOnExit(payload).then(function () {
      markSaved_(sent);
    }, function () {});
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveOnExit_();
  });
  window.addEventListener('pagehide', saveOnExit_);

  // ---------- Error wording ----------

  function isRetryableError_(error) {
    return ['timeout', 'network', 'bad_response', 'server_error'].indexOf(error && error.code) !== -1;
  }

  function describeError_(error) {
    var code = (error && error.code) || 'unknown';
    var text;
    if (code === 'timeout') {
      text = t('errTimeout');
    } else if (code === 'network') {
      text = t('errNetwork');
    } else if (code === 'closed') {
      text = t('errClosed');
    } else if (code === 'server_error' || code === 'bad_response') {
      text = t('errServer');
    } else if (code.indexOf('invalid_') === 0) {
      text = t('errInvalid');
    } else {
      text = t('errUnknown');
    }
    return text + ' (' + code + ')';
  }

  // The server may have saved the answers even when the response never made
  // it back (the reply goes through a redirect that can fail on a flaky
  // connection). Resubmitting is safe - the server upserts by session_id and
  // keeps the first submission time - so retry automatically, and only show
  // an error after several attempts.
  var SUBMIT_MAX_ATTEMPTS = 5;

  function submitFinalAnswers_(lastThemeCompleted, attempt) {
    attempt = attempt || 1;
    if (attempt === 1) renderSendingScreen_();

    var payload = buildProgressPayload_(lastThemeCompleted);
    trackSend_(payload);
    saveInFlight++;
    Api.submit(payload).then(function () {
      saveInFlight--;
      finalSubmitted = true;
      renderEndScreen_();
    }, function (error) {
      saveInFlight--;
      if (isRetryableError_(error) && attempt < SUBMIT_MAX_ATTEMPTS) {
        scheduleSubmitRetry_(lastThemeCompleted, attempt);
      } else {
        renderSubmitError_(error, lastThemeCompleted);
      }
    });
  }

  function scheduleSubmitRetry_(lastThemeCompleted, attempt) {
    var retry = function () {
      setSendingHint_(t('sendingHint'));
      submitFinalAnswers_(lastThemeCompleted, attempt + 1);
    };
    if (navigator.onLine === false) {
      setSendingHint_(t('sendingOffline'));
      window.addEventListener('online', function () {
        setTimeout(retry, 1000);
      }, { once: true });
    } else {
      setSendingHint_(t('sendingSlow'));
      setTimeout(retry, 3000 * attempt);
    }
  }

  function renderEndScreen_() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var hero = document.createElement('div');
    hero.className = 'nz-hero';

    var brand = document.createElement('div');
    brand.className = 'nz-hero__brand';
    var logo = document.createElement('img');
    logo.src = LOGO_URL;
    logo.alt = t('brand');
    brand.appendChild(logo);
    var rule = document.createElement('div');
    rule.className = 'nz-hero__brand-rule';
    brand.appendChild(rule);
    hero.appendChild(brand);

    hero.appendChild(renderProgressSegments_(themeGroups.length, themeGroups.length, 0));

    var art = document.createElement('div');
    art.className = 'nz-hero__art';
    art.appendChild(buildMark_('complete', 7));
    hero.appendChild(art);

    var title = document.createElement('h1');
    title.className = 'nz-hero__title';
    title.style.fontSize = 'var(--nz-fs-thanks)';
    title.textContent = t('thanks');
    hero.appendChild(title);

    var message = document.createElement('p');
    message.className = 'nz-hero__lead';
    message.textContent = t('sentOk');
    hero.appendChild(message);

    var status = document.createElement('div');
    status.className = 'nz-hero__status';
    status.textContent = t('sentStatus');
    hero.appendChild(status);

    app.appendChild(hero);
  }

  function renderSubmitError_(error, lastThemeCompleted) {
    var app = document.getElementById('app');
    app.innerHTML = '';
    scrollToTop_();

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '1');
    title.textContent = t('sendTitle');
    row.appendChild(title);
    topbar.appendChild(row);
    topbar.appendChild(renderProgressSegments_(themeGroups.length, themeGroups.length, 0));
    app.appendChild(topbar);

    var screen = document.createElement('div');
    screen.className = 'nz-error-screen';

    var iconWrap = document.createElement('div');
    iconWrap.className = 'nz-error-screen__icon';
    iconWrap.appendChild(icon_('error'));
    screen.appendChild(iconWrap);

    var status = document.createElement('div');
    status.className = 'nz-error-screen__status';
    status.textContent = t('sendFailStatus');
    screen.appendChild(status);

    var title2 = document.createElement('h1');
    title2.textContent = t('sendFailTitle');
    screen.appendChild(title2);

    var message = document.createElement('p');
    message.textContent = isRetryableError_(error)
      ? t('sendFailLead') + ' ' + describeError_(error)
      : describeError_(error);
    screen.appendChild(message);

    var actions = document.createElement('div');
    actions.className = 'nz-actions';
    var retryButton = makeButton_(t('retry'), 'primary', 'retry');
    retryButton.addEventListener('click', function () {
      submitFinalAnswers_(lastThemeCompleted);
    });
    actions.appendChild(retryButton);
    screen.appendChild(actions);

    app.appendChild(screen);
  }

  // ---------- Shared field builders ----------

  function makeLabeledInput_(id, labelText, isIdField) {
    var wrapper = document.createElement('div');
    wrapper.className = 'nz-field';
    var label = document.createElement('label');
    label.className = 'nz-label';
    label.textContent = labelText;
    label.setAttribute('for', id);
    var input = document.createElement('input');
    input.id = id;
    input.name = id;
    input.type = 'text';
    input.required = true;
    input.className = 'nz-input' + (isIdField ? ' nz-input--id' : '');
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }
