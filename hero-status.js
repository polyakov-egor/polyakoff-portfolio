/* The clock uses Moscow time. Elapsed music time starts at navigation, so
   background throttling and manual clock changes cannot change its duration. */
(() => {
  const clocks = [...document.querySelectorAll('.hero__datetime')].map(clock => ({
    clock,
    dateLabel: clock.querySelector('[data-live-date]'),
    weekdayLabel: clock.querySelector('[data-live-weekday]'),
    timeLabel: clock.querySelector('time'),
  }));
  const elapsedLabels = document.querySelectorAll('[data-music-elapsed]');
  if (!clocks.length && !elapsedLabels.length) return;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const pad = value => String(value).padStart(2, '0');
  const write = (element, value) => {
    if (element && element.textContent !== value) element.textContent = value;
  };
  let timeout;

  function render() {
    const now = new Date();
    if (clocks.length) {
      const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
      const date = `${parts.day} ${parts.month}`;
      const time = `${parts.hour}:${parts.minute}:${parts.second}`;
      for (const { clock, dateLabel, weekdayLabel, timeLabel } of clocks) {
        write(dateLabel, date);
        write(weekdayLabel, parts.weekday);
        write(timeLabel, time);
        if (timeLabel) timeLabel.dateTime = now.toISOString();
        clock.setAttribute('aria-label', `${date}, ${parts.weekday}, ${time} Moscow time`);
      }
    }

    const seconds = Math.floor(Math.max(0, performance.now()) / 1000);
    for (const elapsedLabel of elapsedLabels) write(elapsedLabel, `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`);
  }

  function refresh() {
    clearTimeout(timeout);
    render();
    if (document.hidden) return;
    // Wall-clock seconds and navigation seconds need not start together.
    const untilClockTick = 1000 - Date.now() % 1000;
    const untilElapsedTick = 1000 - performance.now() % 1000;
    timeout = setTimeout(refresh, Math.max(16, Math.min(untilClockTick, untilElapsedTick) + 8));
  }

  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('pagehide', () => clearTimeout(timeout));
  refresh();
})();
