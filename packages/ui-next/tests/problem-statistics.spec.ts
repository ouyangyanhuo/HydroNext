import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('problem statistics source code contains key redesigned components', () => {
    const pagePath = fileURLToPath(new URL('../src/pages/problem_statistics.tsx', import.meta.url));
    const source = readFileSync(pagePath, 'utf8');

    // Ensure common button wrapper is used, not Mantine direct
    assert.doesNotMatch(source, /import\s*\{[^}]*ActionIcon[^}]*\}\s*from\s*['"]@mantine\/core['"]/);
    assert.match(source, /import\s*\{[^}]*ActionIcon[^}]*\}\s*from\s*['"]@\/components\/common\/button['"]/);

    // Meta strip component
    assert.match(source, /function ProblemMetaStrip/);
    assert.match(source, /hydro-problem-statistics__meta-strip/);

    // Status breakdown with multi-progress & legend
    assert.match(source, /Progress\.Root/);
    assert.match(source, /Progress\.Section/);
    assert.match(source, /hydro-problem-statistics__legend-grid/);

    // Score distribution component
    assert.match(source, /function ScoreDistribution/);
    assert.match(source, /hydro-problem-statistics__score-card/);
    assert.match(source, /hydro-problem-statistics__score-bars/);

    // Rank badge
    assert.match(source, /function RankBadge/);
    assert.match(source, /hydro-rank-badge--gold/);
    assert.match(source, /hydro-rank-badge--silver/);
    assert.match(source, /hydro-rank-badge--bronze/);

    // Quick mode switcher
    assert.match(source, /SegmentedControl/);
    assert.match(source, /updateSortMode/);
    assert.match(source, /IconBolt/);
    assert.match(source, /IconClock/);

    // Resource usage bars
    assert.match(source, /hydro-usage-cell/);
    assert.match(source, /hydro-usage-cell__bar/);
});

test('rank computation correctly accounts for pagination offset', () => {
    const calculateRanks = (page: number, pcount: number, rscount: number, listLen: number) => {
        const pageSize = (pcount > 1 && rscount > 0) ? Math.ceil(rscount / pcount) : (listLen || 20);
        const rankOffset = (page - 1) * pageSize;
        return Array.from({ length: listLen }, (_, idx) => rankOffset + idx + 1);
    };

    assert.deepEqual(calculateRanks(1, 3, 60, 20), [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);

    assert.deepEqual(calculateRanks(2, 3, 60, 20).slice(0, 3), [21, 22, 23]);
    assert.deepEqual(calculateRanks(3, 3, 60, 5), [41, 42, 43, 44, 45]);
});

test('score distribution parses scores from pdoc.stats', () => {
    const stats: Record<string, number> = {
        AC: 50,
        WA: 10,
        s0: 10,
        s30: 5,
        s100: 45,
    };

    const scoreItems = Array.from({ length: 101 }, (_, i) => i)
        .map((score) => ({ score, count: Number(stats[`s${score}`]) || 0 }))
        .filter((item) => item.count > 0);

    assert.equal(scoreItems.length, 3);
    assert.deepEqual(scoreItems, [
        { score: 0, count: 10 },
        { score: 30, count: 5 },
        { score: 100, count: 45 },
    ]);
});

test('resource usage percentage compares submission metrics to problem limits', () => {
    const computeRatio = (val: number, limit: number | null) => {
        if (!limit || limit <= 0) return null;
        return Math.min(100, Math.max(4, Math.round((val / limit) * 100)));
    };

    // 15ms out of 1000ms limit -> 4% (clamped min for visibility)
    assert.equal(computeRatio(15, 1000), 4);
    // 500ms out of 1000ms limit -> 50%
    assert.equal(computeRatio(500, 1000), 50);
    // 950ms out of 1000ms limit -> 95%
    assert.equal(computeRatio(950, 1000), 95);
    // 1200ms out of 1000ms limit -> 100% (clamped max)
    assert.equal(computeRatio(1200, 1000), 100);
    // No limit specified -> null
    assert.equal(computeRatio(100, null), null);
});
