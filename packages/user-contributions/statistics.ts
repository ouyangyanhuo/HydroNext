import type { UserContributionDay, UserContributionHistory } from './types';

const DAY = 24 * 60 * 60 * 1000;
export const CONTRIBUTION_TIME_ZONE = 'Asia/Shanghai';

export function buildUserContributions(days: UserContributionDay[], now = new Date()): UserContributionHistory {
    const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayTime = Date.parse(today);
    const yearStart = todayTime - 364 * DAY;
    const monthStart = todayTime - 29 * DAY;
    const ordered = days.filter((day) => day.count > 0 && day.date <= today).sort((a, b) => a.date.localeCompare(b.date));
    const summary = { total: 0, lastYear: 0, lastMonth: 0, longestStreak: 0, lastYearLongestStreak: 0, lastMonthLongestStreak: 0 };
    let previous = Number.NEGATIVE_INFINITY;
    let streak = 0;
    let yearStreak = 0;
    let monthStreak = 0;
    for (const day of ordered) {
        const time = Date.parse(day.date);
        const consecutive = time - previous === DAY;
        streak = consecutive ? streak + 1 : 1;
        yearStreak = time >= yearStart ? (consecutive ? yearStreak + 1 : 1) : 0;
        monthStreak = time >= monthStart ? (consecutive ? monthStreak + 1 : 1) : 0;
        summary.total += day.count;
        if (time >= yearStart) summary.lastYear += day.count;
        if (time >= monthStart) summary.lastMonth += day.count;
        summary.longestStreak = Math.max(summary.longestStreak, streak);
        summary.lastYearLongestStreak = Math.max(summary.lastYearLongestStreak, yearStreak);
        summary.lastMonthLongestStreak = Math.max(summary.lastMonthLongestStreak, monthStreak);
        previous = time;
    }
    return {
        today,
        timeZone: CONTRIBUTION_TIME_ZONE,
        days: ordered.map(({ date, count }) => ({ date, count })),
        summary,
    };
}
