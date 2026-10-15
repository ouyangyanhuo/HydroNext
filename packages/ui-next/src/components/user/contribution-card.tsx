import './contribution-card.css';

import type { UserContributionHistory } from '@hydrooj/common/types';
import { Card, Group, SimpleGrid, Text, Title, Tooltip } from '@mantine/core';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { ButtonBase } from '@/components/common/button';
import { ShortSelect } from '@/components/common/select';
import { useI18n } from '@/hooks/use-i18n';
import { contributionCalendar } from '@/utils/contributions';

export function ContributionCard({ history }: { history: UserContributionHistory }) {
  const { t, language } = useI18n();
  const currentYear = Number(history.today.slice(0, 4));
  const firstYear = Number(history.days[0]?.date.slice(0, 4) || currentYear);
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, index) => String(currentYear - index));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const year = years.includes(String(selectedYear)) ? selectedYear : currentYear;
  const [selectedDate, setSelectedDate] = useState(history.today);
  const [focusedDate, setFocusedDate] = useState(history.today);
  const [tooltipTarget, setTooltipTarget] = useState<HTMLButtonElement | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const { dates, weeks } = useMemo(() => contributionCalendar(year, history.days, history.today), [year, history.days, history.today]);
  const activeDate = selectedDate.startsWith(`${year}-`) ? selectedDate : year === currentYear ? history.today : `${year}-12-31`;
  const tabStopDate = focusedDate.startsWith(`${year}-`) ? focusedDate : year === currentYear ? history.today : `${year}-12-31`;
  const activeDay = dates.find((day) => day.date === activeDate);
  const tooltipDay = dates.find((day) => day.date === tooltipTarget?.dataset.date);
  const yearTotal = dates.reduce((sum, day) => sum + (day.future ? 0 : day.count), 0);
  const locale = language.replace('_', '-');
  const monthFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    } catch {
      return new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
    }
  }, [locale]);
  const metrics = [
    ['All-time solved', history.summary.total, false],
    ['Solved in the last 365 days', history.summary.lastYear, false],
    ['Solved in the last 30 days', history.summary.lastMonth, false],
    ['All-time longest streak', history.summary.longestStreak, true],
    ['Longest streak in the last 365 days', history.summary.lastYearLongestStreak, true],
    ['Longest streak in the last 30 days', history.summary.lastMonthLongestStreak, true],
  ] as const;

  function moveDay(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const steps: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = dates.findIndex((day) => day.date === date);
    const lastIndex = dates.findLastIndex((day) => !day.future);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? lastIndex : Math.max(0, Math.min(lastIndex, index + steps[event.key]));
    calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${dates[nextIndex].date}"]`)?.focus();
  }

  return <Card withBorder p="lg" className="hydro-content-card hydro-contributions">
    <Group justify="space-between" align="flex-start" gap="md" mb="lg">
      <div>
        <Title order={4}>{t('Contribution history')}</Title>
      </div>
      <ShortSelect
        aria-label={t('Contribution year')}
        value={String(year)}
        data={years}
        onChange={(value) => {
          if (value) {
            setTooltipTarget(null);
            setSelectedYear(Number(value));
          }
        }}
        allowDeselect={false}
        width={96}
        className="hydro-contributions__year"
      />
    </Group>
    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" mb="lg" className="hydro-contributions__metrics">
      {metrics.map(([label, value, isStreak]) => <div key={label} className="hydro-contributions__metric">
        <Text size="xs" c="dimmed">{t(label)}</Text>
        <Text className="hydro-contributions__value" fw={650}>{value.toLocaleString()}
          {isStreak && <Text component="span" size="xs" c="dimmed" ml={5}>{t('days')}</Text>}
        </Text>
      </div>)}
    </SimpleGrid>
    <Text size="sm" fw={550} mb="sm">{t('{0} problems solved in {1}', yearTotal, year)}</Text>
    <div className="hydro-contributions__scroll" role="region" aria-label={t('Daily solved problems in {0}', year)} tabIndex={0}>
      <div
        ref={calendarRef}
        className="hydro-contributions__calendar"
        style={{ '--contribution-weeks': weeks } as React.CSSProperties}
        role="group"
        aria-label={t('Daily solved problems in {0}', year)}
      >
        {[1, 3, 5].map((weekday) => <span key={weekday} className="hydro-contributions__weekday" style={{ gridColumn: 1, gridRow: weekday + 2 }}>
          {t(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday])}
        </span>)}
        {dates.filter((day) => day.date.endsWith('-01')).map((day) => <span
          key={day.date}
          className="hydro-contributions__month"
          style={{ gridColumn: `${day.column} / span 3`, gridRow: 1 }}
        >{monthFormatter.format(new Date(`${day.date}T00:00:00Z`))}</span>)}
        {dates.map((day) => <ButtonBase
          key={day.date}
          type="button"
          data-date={day.date}
          data-level={day.future ? 0 : day.level}
          className="hydro-contributions__day"
          style={{ gridColumn: day.column, gridRow: day.row }}
          disabled={day.future}
          tabIndex={day.date === tabStopDate ? 0 : -1}
          aria-label={t('{0}: {1} problems solved', day.date, day.count)}
          onFocus={(event) => {
            setFocusedDate(day.date);
            setSelectedDate(day.date);
            setTooltipTarget(event.currentTarget);
          }}
          onBlur={() => setTooltipTarget(null)}
          onMouseEnter={(event) => {
            if (!day.future) {
              setSelectedDate(day.date);
              setTooltipTarget(event.currentTarget);
            }
          }}
          onMouseLeave={() => setTooltipTarget(null)}
          onClick={() => setSelectedDate(day.date)}
          onKeyDown={(event) => moveDay(event, day.date)}
        />)}
      </div>
    </div>
    {tooltipTarget && tooltipDay && !tooltipDay.future && <Tooltip
      target={tooltipTarget}
      label={t('{0}: {1} problems solved', tooltipDay.date, tooltipDay.count)}
      opened
      withinPortal
      withArrow
    />}
    <Group justify="space-between" gap="sm" mt="sm">
      <Text size="xs" c="dimmed" aria-live="polite">{t('{0}: {1} problems solved', activeDate, activeDay?.count || 0)}</Text>
      <Group gap={5} className="hydro-contributions__legend" aria-label={t('Daily solved problems')}>
        <Text size="xs" c="dimmed">{t('Less')}</Text>
        {[0, 1, 2, 3, 4].map((level) => <span key={level} data-level={level} className="hydro-contributions__swatch" aria-hidden="true" />)}
        <Text size="xs" c="dimmed">{t('More')}</Text>
      </Group>
    </Group>
    {history.summary.total === 0 && <Text size="sm" c="dimmed" ta="center" mt="md">{t('No problems solved yet.')}</Text>}
    <Text size="xs" c="dimmed" mt="md">{t('Dates use UTC+8. Recent year and month mean the last 365 and 30 days, including today.')}</Text>
  </Card>;
}
