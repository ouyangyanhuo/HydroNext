export interface UserContributionDay {
    date: string;
    count: number;
}

export interface UserContributionHistory {
    today: string;
    timeZone: string;
    days: UserContributionDay[];
    summary: {
        total: number;
        lastYear: number;
        lastMonth: number;
        longestStreak: number;
        lastYearLongestStreak: number;
        lastMonthLongestStreak: number;
    };
}
