import { Accordion, Paper, Stack, Text, Title } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

const HELP_SECTIONS = [
  { title: { en: 'Getting Started', zh: '快速入门' }, content: { en: 'Welcome to Hydro OJ. Register an account and start solving problems.', zh: '欢迎使用 Hydro OJ。注册账号后即可开始解题。' } },
  { title: { en: 'Supported Languages', zh: '支持的语言' }, content: { en: 'C, C++, Python, Java, Go, Rust, Pascal, and more.', zh: '支持 C、C++、Python、Java、Go、Rust、Pascal 等多种语言。' } },
  { title: { en: 'Judge Status', zh: '评测状态' }, content: { en: 'AC = Accepted, WA = Wrong Answer, TLE = Time Limit Exceeded, MLE = Memory Limit Exceeded, RE = Runtime Error, CE = Compile Error.', zh: 'AC = 通过, WA = 答案错误, TLE = 超时, MLE = 超内存, RE = 运行错误, CE = 编译错误。' } },
  { title: { en: 'Contest Rules', zh: '比赛规则' }, content: { en: 'Hydro supports ACM/ICPC and OI contest rules. Check the contest details for specific rules.', zh: 'Hydro 支持 ACM/ICPC 和 OI 赛制。请查看具体比赛详情了解规则。' } },
  { title: { en: 'Markdown Syntax', zh: 'Markdown 语法' }, content: { en: 'Problem statements support Markdown with LaTeX math formulas. Use $ for inline math and $$ for display math.', zh: '题目描述支持 Markdown 和 LaTeX 公式。使用 $ 行内公式，$$ 块级公式。' } },
];

export default function WikiHelpPage() {
  const { t } = useI18n();
  const language = useSessionStore((s) => s.language);

  return (
    <Stack gap="lg">
      <Title order={2}>{t('Help')}</Title>
      <Paper withBorder p="lg">
        <Accordion variant="separated">
          {HELP_SECTIONS.map((section, i) => (
            <Accordion.Item key={i} value={String(i)}>
              <Accordion.Control>{extractLocalizedContent(section.title, language)}</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">{extractLocalizedContent(section.content, language)}</Text>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Paper>
    </Stack>
  );
}
