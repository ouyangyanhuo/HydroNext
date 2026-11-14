export const NAV_ITEMS = [
  { to: 'homepage', label: 'Home' },
  { to: 'problem_main', label: 'Problems' },
  { to: 'contest_main', label: 'Contests' },
  { to: 'training_main', label: 'Training' },
  { to: 'record_main', label: 'Records' },
  { to: 'ranking', label: 'Ranking' },
] as const;

export type NavItemRoute = typeof NAV_ITEMS[number]['to'];

export const TOP_NAV_ORDER: Record<string, number> = Object.fromEntries(
  NAV_ITEMS.map((item, index) => [item.to, index]),
);

export interface TopNavVisibilityOptions {
  navigationHidden?: Record<string, boolean>;
  contestMode?: boolean;
  canViewRanking?: boolean;
  focusContest?: string;
  canViewContestRanking?: boolean;
}

export function isNavItemVisible(route: string, options?: TopNavVisibilityOptions): boolean {
  if (options?.navigationHidden?.[route] === true) return false;
  if (options?.contestMode && ['homepage', 'problem_main', 'training_main'].includes(route)) return false;
  if (route === 'ranking') {
    if (options?.focusContest) {
      if (options?.canViewContestRanking === false) return false;
    } else if (options?.canViewRanking === false) {
      return false;
    }
  }
  return true;
}

export function getVisibleNavItems(options?: TopNavVisibilityOptions) {
  return NAV_ITEMS.filter((item) => isNavItemVisible(item.to, options));
}

export function getTopNavIndex(name: string, options?: TopNavVisibilityOptions): number | null {
  if (!name) return null;
  let targetRoute = '';
  if (NAV_ITEMS.some((item) => item.to === name)) targetRoute = name;
  else if (name.startsWith('problem_')) targetRoute = 'problem_main';
  else if (name.startsWith('contest_')) targetRoute = 'contest_main';
  else if (name.startsWith('training_')) targetRoute = 'training_main';
  else if (name.startsWith('record_')) targetRoute = 'record_main';
  else return null;

  if (options && !isNavItemVisible(targetRoute, options)) {
    return null;
  }

  const visible = getVisibleNavItems(options);
  const index = visible.findIndex((item) => item.to === targetRoute);
  return index >= 0 ? index : null;
}
