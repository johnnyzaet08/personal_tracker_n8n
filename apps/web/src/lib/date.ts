const COSTA_RICA_TIME_ZONE = 'America/Costa_Rica';

export function todayInCostaRica(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: COSTA_RICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function currentPeriodInCostaRica(now = new Date()): string {
  return todayInCostaRica(now).slice(0, 7);
}
