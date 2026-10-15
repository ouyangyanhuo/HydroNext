import type { UserContributionDay } from '@hydrooj/common/types';

const DAY = 24 * 60 * 60 * 1000;

export function contributionLevel(count: number) {
  if (count <= 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}

export function contributionCalendar(year: number, days: UserContributionDay[], today: string) {
  const counts = new Map(days.map((day) => [day.date, day.count]));
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const offset = new Date(start).getUTCDay();
  const dates = Array.from({ length: (end - start) / DAY }, (_, index) => {
    const time = start + index * DAY;
    const date = new Date(time).toISOString().slice(0, 10);
    const count = counts.get(date) || 0;
    return {
      date,
      count,
      level: contributionLevel(count),
      column: Math.floor((index + offset) / 7) + 2,
      row: ((index + offset) % 7) + 2,
      future: date > today,
    };
  });
  return { dates, weeks: Math.ceil((dates.length + offset) / 7) };
}
