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

  document.addEventListener('DOMContentLoaded', function () {
    Api.getDefinition().then(onSurveyLoaded_, onLoadError_);
  });

  // Shown while the final submission is in flight; it can take a while when
  // Google is slow, so it says so and asks not to close the page.
  function renderSendingScreen_() {
    var app = document.getElementById('app');
    app.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'nz-sending';
    var title = document.createElement('p');
    title.className = 'nz-sending__title';
    title.textContent = 'שולח...';
    var hint = document.createElement('p');
    hint.className = 'nz-sending__hint';
    hint.textContent = 'נא לא לסגור את המסך עד שההודעה תופיע.';
    wrap.appendChild(title);
    wrap.appendChild(hint);
    app.appendChild(wrap);
  }

  function renderStatusMessage_(text) {
    var app = document.getElementById('app');
    app.innerHTML = '';
    var message = document.createElement('p');
    message.className = 'nz-status-message';
    message.textContent = text;
    app.appendChild(message);
  }

  function onLoadError_(error) {
    renderStatusMessage_('שגיאה בטעינת השאלון. ' + describeError_(error) + ' אפשר לרענן את הדף ולנסות שוב.');
  }

  function onSurveyLoaded_(definition) {
    surveyDefinition = definition;
    if (definition.activeQuestionnaire === 'closed') {
      renderStatusMessage_('השאלון סגור כרגע.');
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
    return template.content.firstChild;
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
    var polygons = svg.querySelectorAll('polygon');
    for (var i = 0; i < polygons.length && i < filledCount; i++) {
      polygons[i].classList.add('is-filled');
    }
    return svg;
  }

  // ---------- Progress segments (one per part) ----------

  function renderProgressSegments_(totalSegments, currentIndex, currentFractionPct) {
    var progress = document.createElement('div');
    progress.className = 'nz-progress';
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

    var hero = document.createElement('div');
    hero.className = 'nz-hero';

    var brand = document.createElement('div');
    brand.className = 'nz-hero__brand';
    var logo = document.createElement('img');
    logo.src = LOGO_URL;
    logo.alt = 'ניצנים';
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
    eyebrow.textContent = 'שאלון חניכים';
    hero.appendChild(eyebrow);

    var title = document.createElement('h1');
    title.className = 'nz-hero__title';
    title.textContent = 'ניצנים';
    hero.appendChild(title);

    var lead = document.createElement('p');
    lead.className = 'nz-hero__lead';
    lead.textContent = 'כמה שאלות קצרות שעוזרות לנו להכיר אותך טוב יותר. אין תשובות נכונות או לא נכונות.';
    hero.appendChild(lead);

    var timeRow = document.createElement('div');
    timeRow.className = 'nz-hero__time';
    var strong = document.createElement('strong');
    strong.textContent = estimateMinutes_();
    timeRow.appendChild(strong);
    var timeLabel = document.createElement('span');
    timeLabel.textContent = 'דקות בערך';
    timeRow.appendChild(timeLabel);
    hero.appendChild(timeRow);

    var actions = document.createElement('div');
    actions.className = 'nz-actions';
    var startButton = makeButton_('התחלה', 'on-dark', 'arrow');
    startButton.addEventListener('click', renderDetailsStep_);
    actions.appendChild(startButton);
    hero.appendChild(actions);

    app.appendChild(hero);
  }

  // ---------- Details step ----------

  function renderDetailsStep_() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var eyebrow = document.createElement('div');
    eyebrow.className = 'nz-topbar__eyebrow';
    eyebrow.textContent = 'שלב 1';
    var titleWrap = document.createElement('div');
    titleWrap.appendChild(eyebrow);
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.textContent = 'פרטים אישיים';
    titleWrap.appendChild(title);
    row.appendChild(titleWrap);
    topbar.appendChild(row);
    topbar.appendChild(renderProgressSegments_(surveyDefinition.themes.length, -1, 0));
    app.appendChild(topbar);

    var main = document.createElement('div');
    main.className = 'nz-main';

    var form = document.createElement('form');
    form.id = 'detailsForm';

    var idField = makeLabeledInput_('id_number', 'תעודת זהות', true);
    var idError = document.createElement('div');
    idError.id = 'id_number_error';
    idError.className = 'nz-error';
    idField.appendChild(idError);
    form.appendChild(idField);

    form.appendChild(makeSegmented_('gender', 'מגדר', surveyDefinition.settingsLists.gender));

    if (surveyDefinition.collectCity) {
      form.appendChild(makeLabeledInput_('city', 'עיר מגורים', false));
    }

    var divider = document.createElement('hr');
    divider.className = 'nz-divider';
    form.appendChild(divider);

    var stepsHeading = document.createElement('h2');
    stepsHeading.className = 'nz-section-heading';
    stepsHeading.textContent = 'בחירת קבוצה';
    form.appendChild(stepsHeading);

    appendGroupSteps_(form);

    if (studentDetails) {
      prefillDetailsForm_(form);
    }

    var actions = document.createElement('div');
    actions.className = 'nz-actions';
    var submitButton = makeButton_('המשך', 'primary', 'arrow');
    submitButton.type = 'submit';
    actions.appendChild(submitButton);
    form.appendChild(actions);

    var idInput = form.querySelector('#id_number');
    function refreshSubmitState_() {
      submitButton.disabled = !isValidIsraeliId_(idInput.value);
    }
    idInput.addEventListener('input', refreshSubmitState_);
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

    stepsWrap.appendChild(makeStepField_('01', 'מרחב', spaceSelect, 'done'));
    stepsWrap.appendChild(makeStepField_('02', 'מדריך', instructorSelect, 'done'));
    stepsWrap.appendChild(makeStepField_('03', 'קבוצה', groupSelect, 'active'));

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
      btn.textContent = optionText;
      btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      btn.dataset.value = optionText;
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(group.children, function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
      });
      group.appendChild(btn);
    });

    field.appendChild(group);
    return field;
  }

  function getSegmentedValue_(groupEl) {
    var pressed = groupEl.querySelector('[aria-pressed="true"]');
    return pressed ? pressed.dataset.value : null;
  }

  function setSegmentedValue_(groupEl, value) {
    Array.prototype.forEach.call(groupEl.children, function (b) {
      b.setAttribute('aria-pressed', b.dataset.value === value ? 'true' : 'false');
    });
  }

  function handleDetailsSubmit_(form) {
    var idInput = form.querySelector('#id_number');
    var idNumberRaw = idInput.value;
    var idError = document.getElementById('id_number_error');
    idError.textContent = '';
    idInput.removeAttribute('aria-invalid');

    if (!isValidIsraeliId_(idNumberRaw)) {
      idError.textContent = 'מספר תעודת הזהות אינו תקין. יש להזין עד 9 ספרות.';
      idInput.setAttribute('aria-invalid', 'true');
      return;
    }

    if (surveyDefinition.collectCity) {
      var cityInput = form.querySelector('#city');
      if (!cityInput.value.trim()) {
        cityInput.setCustomValidity('יש להזין עיר מגורים');
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
      id_number: padIdNumber_(idNumberRaw),
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
    setSegmentedValue_(document.getElementById('gender'), studentDetails.gender);
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

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.textContent = 'אישור פרטים';
    row.appendChild(title);
    topbar.appendChild(row);
    topbar.appendChild(renderProgressSegments_(surveyDefinition.themes.length, -1, 0));
    app.appendChild(topbar);

    var main = document.createElement('div');
    main.className = 'nz-main';

    var title2 = document.createElement('h1');
    title2.className = 'nz-h1';
    title2.textContent = 'לפני שממשיכים';
    main.appendChild(title2);

    var subLine = document.createElement('p');
    subLine.className = 'nz-subline';
    subLine.textContent = 'בודקים שהכול נכון';
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

    addRow('תעודת זהות', studentDetails.id_number);
    addRow('מגדר', studentDetails.gender);
    if (surveyDefinition.collectCity) {
      addRow('עיר', studentDetails.city);
    }
    addRow('קבוצה', studentDetails.groupLabel + ' (' + studentDetails.instructor + ')');

    main.appendChild(dl);

    var actions = document.createElement('div');
    actions.className = 'nz-actions';

    var continueButton = makeButton_('המשך', 'primary', 'arrow');
    continueButton.addEventListener('click', startThemeFlow_);
    actions.appendChild(continueButton);

    var editButton = makeButton_('עריכה', 'secondary', 'edit');
    editButton.addEventListener('click', renderDetailsStep_);
    actions.appendChild(editButton);

    main.appendChild(actions);
    app.appendChild(main);
  }

  // ---------- Theme flow: reveal/fold questions + discrete scale ----------

  function filterQuestionsForClass_(questions, studentClass) {
    return questions.filter(function (q) {
      if (!q.classes || q.classes === 'all') return true;
      return q.classes.split(',').map(function (c) { return c.trim(); }).indexOf(studentClass) !== -1;
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
      renderStatusMessage_('אין שאלות רלוונטיות עבורך בשאלון זה.');
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

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.textContent = 'חלק ' + (currentThemeIndex + 1) + ' מתוך ' + themeGroups.length;
    row.appendChild(title);
    var facetsFilled = Math.round((currentThemeIndex / themeGroups.length) * 7);
    var smallMark = buildMark_(null, facetsFilled);
    smallMark.style.width = '48px';
    smallMark.style.height = '32px';
    row.appendChild(smallMark);
    topbar.appendChild(row);

    var answeredInTheme = theme.questions.filter(function (q) { return q.item_id in answers; }).length;
    var currentFractionPct = Math.round((answeredInTheme / theme.questions.length) * 100);
    topbar.appendChild(renderProgressSegments_(themeGroups.length, currentThemeIndex, currentFractionPct));

    app.appendChild(topbar);

    var main = document.createElement('div');
    main.className = 'nz-main';

    var log = document.createElement('div');
    log.className = 'nz-log';
    var hasLogRows = false;
    var activeIndex = -1;

    for (var i = 0; i < theme.questions.length; i++) {
      var question = theme.questions[i];
      if (question.item_id === activeItemId) {
        activeIndex = i;
        break;
      } else if (question.item_id in answers) {
        log.appendChild(renderCollapsedRow_(question, i));
        hasLogRows = true;
      } else {
        break;
      }
    }
    if (hasLogRows) main.appendChild(log);

    main.appendChild(renderActiveQuestion_(theme.questions[activeIndex], activeIndex, hasLogRows));
    app.appendChild(main);
  }

  function renderCollapsedRow_(question, indexInTheme) {
    var row = document.createElement('div');
    row.className = 'nz-log__row' + (surveyDefinition.allowBack ? ' is-editable' : '');
    if (surveyDefinition.allowBack) {
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
    }

    var rail = document.createElement('div');
    rail.className = 'nz-log__rail';
    row.appendChild(rail);

    var idx = document.createElement('span');
    idx.className = 'nz-log__idx nz-mono';
    idx.textContent = (currentThemeIndex + 1) + '.' + (indexInTheme + 1);
    row.appendChild(idx);

    var text = document.createElement('span');
    text.className = 'nz-log__text';
    text.textContent = question.text;
    row.appendChild(text);

    var value = document.createElement('span');
    value.className = 'nz-log__value nz-mono';
    value.textContent = answers[question.item_id];
    var small = document.createElement('small');
    small.textContent = '/' + surveyDefinition.scaleMax;
    value.appendChild(small);
    row.appendChild(value);

    if (surveyDefinition.allowBack) {
      var openForEdit = function () {
        activeItemId = question.item_id;
        renderThemeStep_();
      };
      row.addEventListener('click', openForEdit);
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openForEdit();
        }
      });
    }
    return row;
  }

  function renderActiveQuestion_(question, indexInTheme, hasLogRows) {
    var wrapper = document.createElement('div');
    wrapper.className = 'nz-q';

    var rail = document.createElement('div');
    rail.className = 'nz-q__rail' + (hasLogRows ? '' : ' is-first');
    wrapper.appendChild(rail);

    var body = document.createElement('div');
    body.className = 'nz-q__body';

    var meta = document.createElement('div');
    meta.className = 'nz-q__meta';
    var metaIdx = document.createElement('span');
    metaIdx.className = 'nz-mono';
    metaIdx.textContent = (currentThemeIndex + 1) + '.' + (indexInTheme + 1);
    meta.appendChild(metaIdx);
    body.appendChild(meta);

    var questionText = document.createElement('p');
    questionText.className = 'nz-q__text';
    questionText.textContent = question.text;
    body.appendChild(questionText);

    // Response time is measured only the first time a question is shown -
    // reopening an already-answered row (allow_back) doesn't restart the
    // clock or claim another presentation-order slot.
    var isFirstReveal = !(question.item_id in responseTimes);
    var revealedAt = isFirstReveal ? Date.now() : null;
    var revealOrder = isFirstReveal ? ++presentationOrderCounter : null;
    var existingValue = answers[question.item_id];
    var selectedValue = existingValue;

    var scale = document.createElement('div');
    scale.className = 'nz-scale';

    var track = document.createElement('div');
    track.className = 'nz-scale__track';
    track.setAttribute('role', 'radiogroup');
    track.setAttribute('aria-label', question.text);

    var nums = document.createElement('div');
    nums.className = 'nz-scale__nums';

    var continueButton = makeButton_('המשך', 'primary', 'arrow');
    continueButton.disabled = existingValue === undefined;

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
        var ariaLabel = value + ' מתוך ' + scaleMax;
        if (value === 1) ariaLabel += ', ' + question.anchor_low;
        if (value === scaleMax) ariaLabel += ', ' + question.anchor_high;
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

    scale.appendChild(track);
    scale.appendChild(nums);

    var anchors = document.createElement('div');
    anchors.className = 'nz-scale__anchors';
    var lowAnchor = document.createElement('span');
    lowAnchor.textContent = question.anchor_low;
    var highAnchor = document.createElement('span');
    highAnchor.textContent = question.anchor_high;
    anchors.appendChild(lowAnchor);
    anchors.appendChild(highAnchor);
    scale.appendChild(anchors);

    body.appendChild(scale);

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
      gender: studentDetails.gender,
      city: studentDetails.city,
      group_id: studentDetails.group_id,
      district: studentDetails.district,
      space: studentDetails.space,
      instructor: studentDetails.instructor,
      class: studentDetails.class,
      major: studentDetails.major,
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      answers: answers,
      responseTimes: responseTimes,
      last_theme_completed: lastThemeCompleted || ''
    };
  }

  // Checkpoint saves never block the UI and never bother the student on
  // failure - answers stay safe in memory regardless, and the flow keeps
  // moving forward. Retries silently with backoff, then gives up quietly;
  // only a failed FINAL submission is ever shown to the student.
  function saveCheckpointWithRetry_(lastThemeCompleted, attempt) {
    attempt = attempt || 1;
    var payload = buildProgressPayload_(lastThemeCompleted);
    var sent = trackSend_(payload);
    Api.saveCheckpoint(payload).then(function () {
      markSaved_(sent);
    }, function (error) {
      // Only transport problems are worth retrying; a rejection by the
      // server (e.g. the survey was closed) would just repeat.
      if (attempt < 5 && isRetryableError_(error)) {
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

  // ---------- Error wording ----------

  function isRetryableError_(error) {
    return ['timeout', 'network', 'bad_response', 'server_error'].indexOf(error && error.code) !== -1;
  }

  function describeError_(error) {
    var code = (error && error.code) || 'unknown';
    var text;
    if (code === 'timeout') {
      text = 'החיבור לשרת לקח יותר מדי זמן.';
    } else if (code === 'network') {
      text = 'אין חיבור יציב לאינטרנט.';
    } else if (code === 'closed') {
      text = 'השאלון נסגר.';
    } else if (code === 'server_error' || code === 'bad_response') {
      text = 'השרת לא הצליח לטפל בבקשה.';
    } else if (code.indexOf('invalid_') === 0) {
      text = 'חלק מהפרטים לא נקלטו כראוי. כדאי לפנות למדריך.';
    } else {
      text = 'אירעה תקלה לא צפויה.';
    }
    return text + ' (' + code + ')';
  }

  function submitFinalAnswers_(lastThemeCompleted) {
    renderSendingScreen_();

    var payload = buildProgressPayload_(lastThemeCompleted);
    trackSend_(payload);
    Api.submit(payload).then(function () {
      finalSubmitted = true;
      renderEndScreen_();
    }, function (error) {
      renderSubmitError_(error, lastThemeCompleted);
    });
  }

  function renderEndScreen_() {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var hero = document.createElement('div');
    hero.className = 'nz-hero';

    var brand = document.createElement('div');
    brand.className = 'nz-hero__brand';
    var logo = document.createElement('img');
    logo.src = LOGO_URL;
    logo.alt = 'ניצנים';
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
    title.textContent = 'תודה!';
    hero.appendChild(title);

    var message = document.createElement('p');
    message.className = 'nz-hero__lead';
    message.textContent = 'התשובות שלך נשלחו בהצלחה.';
    hero.appendChild(message);

    var status = document.createElement('div');
    status.className = 'nz-hero__status';
    status.textContent = 'נשלח';
    hero.appendChild(status);

    app.appendChild(hero);
  }

  function renderSubmitError_(error, lastThemeCompleted) {
    var app = document.getElementById('app');
    app.innerHTML = '';

    var topbar = document.createElement('div');
    topbar.className = 'nz-topbar';
    var row = document.createElement('div');
    row.className = 'nz-topbar__row';
    var title = document.createElement('div');
    title.className = 'nz-topbar__title';
    title.textContent = 'שליחה';
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
    status.textContent = 'השליחה נכשלה';
    screen.appendChild(status);

    var title2 = document.createElement('h1');
    title2.textContent = 'לא הצלחנו לשלוח';
    screen.appendChild(title2);

    var message = document.createElement('p');
    message.textContent = 'התשובות שלך שמורות במכשיר, ואפשר לנסות שוב. ' + describeError_(error);
    screen.appendChild(message);

    var actions = document.createElement('div');
    actions.className = 'nz-actions';
    var retryButton = makeButton_('נסה שוב', 'primary', 'retry');
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
