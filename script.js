let events = [];

const categoryFilter = document.querySelector('#category-filter');
const dayFilter = document.querySelector('#day-filter');
const searchFilter = document.querySelector('#search-filter');
const eventGrid = document.querySelector('#event-grid');
const scheduleList = document.querySelector('#schedule-list');
const eventCount = document.querySelector('#event-count');
const emptyEvents = document.querySelector('#empty-events');
const emptySchedule = document.querySelector('#empty-schedule');
const registrationDialog = document.querySelector('#register-dialog');
const form = document.querySelector('#registration-form');
const selectedEventId = document.querySelector('#selected-event-id');
const selectedEventTitle = document.querySelector('#selected-event-title');
const selectedEventMeta = document.querySelector('#selected-event-meta');
const formFeedback = document.querySelector('#form-feedback');
const submitButton = form.querySelector('.button-submit');
const submitButtonLabel = 'Email me a verification link';

const dateLabel = (date, weekday = false) => new Intl.DateTimeFormat('en', {
  weekday: weekday ? 'short' : undefined,
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`));

function getVisibleEvents() {
  const category = categoryFilter.value;
  const day = dayFilter.value;
  const query = searchFilter.value.trim().toLowerCase();
  return events.filter((event) => {
    const matchesCategory = category === 'all' || event.category === category;
    const matchesDay = day === 'all' || event.date === day;
    const searchable = `${event.title} ${event.category} ${event.venue} ${event.description}`.toLowerCase();
    return matchesCategory && matchesDay && searchable.includes(query);
  });
}

function renderCards(visibleEvents) {
  eventGrid.innerHTML = visibleEvents.map((event, index) => `
    <article class="event-card" data-index="${String(index + 1).padStart(2, '0')}">
      <div class="card-top"><span class="category-tag ${event.category.toLowerCase()}">${event.category}</span><span class="card-arrow" aria-hidden="true">↗</span></div>
      <h3>${event.title}</h3>
      <p class="event-description">${event.description}</p>
      <div class="card-bottom"><span class="card-date">${dateLabel(event.date, true)} · ${event.displayTime}</span><span class="card-venue">${event.venue}</span></div>
      <button class="event-register" type="button" data-event-id="${event.id}" aria-label="Register for ${event.title}">Register for this event <span aria-hidden="true">↗</span></button>
    </article>
  `).join('');
  emptyEvents.hidden = visibleEvents.length > 0;
  eventGrid.hidden = visibleEvents.length === 0;
  eventCount.innerHTML = visibleEvents.length === events.length
    ? `Showing <strong>all ${events.length} events</strong>`
    : `Showing <strong>${visibleEvents.length} of ${events.length} events</strong>`;
}

function renderSchedule(visibleEvents) {
  const byDay = new Map();
  [...visibleEvents].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
    .forEach((event) => {
      if (!byDay.has(event.date)) byDay.set(event.date, new Map());
      const byTime = byDay.get(event.date);
      if (!byTime.has(event.time)) byTime.set(event.time, []);
      byTime.get(event.time).push(event);
    });

  scheduleList.innerHTML = [...byDay.entries()].map(([date, byTime]) => {
    const [weekday, day] = dateLabel(date, true).split(', ');
    const monthDay = dateLabel(date);
    const rows = [...byTime.entries()].map(([time, sessions]) => `
      <li class="schedule-row">
        <time class="schedule-time" datetime="${date}T${time}">${sessions[0].displayTime}</time>
        <div class="schedule-sessions">${sessions.map((event) => `
          <article class="schedule-session">
            <div><span class="category-tag ${event.category.toLowerCase()}">${event.category}</span><h4>${event.title}</h4><p>${event.description}</p></div>
            <span class="schedule-venue">${event.venue}</span>
          </article>
        `).join('')}</div>
      </li>
    `).join('');
    return `<section class="schedule-day" aria-label="${weekday}, ${monthDay}"><div class="day-label"><span>${weekday.toUpperCase()} / ${String(day).padStart(2, '0')}</span><h3>${monthDay}</h3><p>${byTime.size} TIME BLOCKS</p></div><ol class="schedule-entries">${rows}</ol></section>`;
  }).join('');
  emptySchedule.hidden = visibleEvents.length > 0;
  scheduleList.hidden = visibleEvents.length === 0;
}

function updateListings() {
  const visibleEvents = getVisibleEvents();
  renderCards(visibleEvents);
  renderSchedule(visibleEvents);
}

async function loadEvents() {
  try {
    const response = await fetch('/events.json');
    if (!response.ok) throw new Error('Could not load the event list.');
    events = await response.json();
    updateListings();
  } catch (error) {
    eventGrid.hidden = true;
    scheduleList.hidden = true;
    emptyEvents.hidden = false;
    emptyEvents.textContent = 'The event list could not load. Start the site using npm start and refresh this page.';
    emptySchedule.hidden = true;
    eventCount.textContent = 'Events are unavailable';
  }
}

[categoryFilter, dayFilter].forEach((control) => control.addEventListener('change', updateListings));
searchFilter.addEventListener('input', updateListings);
document.querySelector('#reset-filters').addEventListener('click', () => {
  categoryFilter.value = 'all';
  dayFilter.value = 'all';
  searchFilter.value = '';
  updateListings();
});

eventGrid.addEventListener('click', (clickEvent) => {
  const registerButton = clickEvent.target.closest('.event-register');
  if (!registerButton) return;
  const event = events.find((item) => item.id === registerButton.dataset.eventId);
  if (!event) return;

  form.reset();
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = false; });
  submitButton.innerHTML = `${submitButtonLabel} <span aria-hidden="true">↗</span>`;
  formFeedback.hidden = true;
  selectedEventId.value = event.id;
  selectedEventTitle.textContent = event.title;
  selectedEventMeta.textContent = `${event.category} · ${dateLabel(event.date, true)} · ${event.displayTime} · ${event.venue}`;
  registrationDialog.showModal();
  document.querySelector('#full-name').focus();
});

document.querySelector('.dialog-close').addEventListener('click', () => registrationDialog.close());
registrationDialog.addEventListener('click', (clickEvent) => {
  if (clickEvent.target === registrationDialog) registrationDialog.close();
});
registrationDialog.addEventListener('close', () => {
  form.reset();
  form.querySelectorAll('input, textarea, button').forEach((field) => { field.disabled = false; });
  submitButton.innerHTML = `${submitButtonLabel} <span aria-hidden="true">↗</span>`;
  formFeedback.hidden = true;
});

form.addEventListener('submit', async (submitEvent) => {
  submitEvent.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const registration = Object.fromEntries(formData.entries());
  submitButton.disabled = true;
  submitButton.textContent = 'Sending verification link…';
  formFeedback.hidden = true;

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registration),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Registration could not be completed.');

    formFeedback.textContent = result.message;
    formFeedback.hidden = false;
    form.querySelectorAll('input, textarea').forEach((field) => { field.disabled = true; });
    submitButton.textContent = 'Verification email sent';
  } catch (error) {
    formFeedback.textContent = error.message || 'Could not send the verification email. Please try again.';
    formFeedback.hidden = false;
    submitButton.disabled = false;
    submitButton.innerHTML = `${submitButtonLabel} <span aria-hidden="true">↗</span>`;
  }
});

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#primary-navigation');
menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  navigation.classList.toggle('is-open', !isOpen);
});
navigation.addEventListener('click', (clickEvent) => {
  if (clickEvent.target.closest('a')) {
    menuToggle.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
  }
});

loadEvents();
