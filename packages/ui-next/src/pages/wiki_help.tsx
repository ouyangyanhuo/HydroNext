import { Paper, Stack, Title } from '@mantine/core';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { useUiContext } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

const HELP_SECTIONS = [
  {
    id: 'domain',
    title: 'Domain',
    content: `
每个用户可以创建自己的域。比如，老师可以为课程创建一个域，然后把题目和学生加入到此域中。再如，可以把域作为团队功能。

通过合理的设置角色及其权限，可以把域设为公开或私有。

默认域为 system，用户直接访问 HNTOU OJ 域名就会访问此域，点击 HNTOU OJ Logo 会从任意域跳转回 system 域。

每个域的题库、讨论、训练以及比赛是独立且自治的。
`.trim(),
  },
  {
    id: 'compiler',
    title: "Compilers' Version and Parameters",
    content: 'HNTOU OJ 使用 [HydroJudge](https://github.com/hydro-dev/Hydro/tree/master/packages/hydrojudge) 进行评测，编译参数和当前所用编译器版本见状态页。',
  },
  {
    id: 'limits',
    title: 'Limitations',
    content: `
HNTOU OJ 评测机使用进程的 CPU 时间计算时间消耗，时间的限定为题目中评测点所指定的时间。

HNTOU OJ 评测机使用进程虚拟内存与物理内存总和计算内存空间消耗。内存空间默认限定为 256MiB，题目中特别指明的，限定为题目中评测点所指定的内存空间。
`.trim(),
  },
  {
    id: 'io',
    title: 'IO',
    content: '若无特殊说明，HNTOU OJ 使用标准输入输出（控制台输入输出，屏幕输入输出，STD I/O）。',
  },
  {
    id: 'status',
    title: 'Judge Status',
    content: `
- Waiting 评测：评测请求正在等待被评测机抓取
- Fetched 评测：评测请求已被评测机抓取，正在准备开始评测
- Compiling 评测：正在编译中
- Judging 评测：编译成功，正在评测中
- Accepted 通过：程序输出完全正确
- Wrong Answer 不通过：程序输出与标准答案不一致（不包括行末空格以及文件末空行）
- Time Limit Exceeded 不通过：程序运行时间超过了题目限制
- Memory Limit Exceeded 不通过：程序运行内存空间超过了题目限制
- Runtime Error 不通过：程序运行时错误（如数组越界、被零除、运算溢出、栈溢出、无效指针等）
- Compile Error 不通过：编译失败
- System Error 错误：系统错误（如果您遇到此问题，请及时在讨论区进行反馈）
- Canceled 其他：评测被取消
- Unknown Error 其他：未知错误
- Ignored 其他：被忽略

> 有“成绩取消”字样则说明管理员手动标记此记录为取消，可能违反了服务条款，比如代码被发现与其他用户的代码十分相似。
`.trim(),
  },
  {
    id: 'ce',
    title: 'Compile Error',
    content: `
可能有以下情况：

1. 递交时选错了编程语言
2. Java 的主类名没有使用 "Main"
3. 对于 C/C++：见下
4. 一般性的编译错误

对 C/C++ 选手的特别提醒：

1. __int64 在 GNU C++ 中应写成 long long 类型
2. main() 返回值必须定义为 int，而不是 void
3. for 语句中的指标变量 i 将会在如 \`for (int i = 0...) {...}\` 语句之后变为无效
4. itoa 不是一个通用 ANSI 函数（标准 C/C++ 中无此函数）
5. printf 中使用 %lf 格式是不正确的
`.trim(),
  },
  {
    id: 'training',
    title: 'Training',
    content: '我们精心挑选了一些题目组成了训练计划。单击导航栏的“训练”即可进入！',
  },
  {
    id: 'contest',
    title: 'Contest',
    content: `
按照赛制不同，有不同的递交、排名规则。

在 IOI，XCPC，Ledo，IOI(Strict) 赛制下，选手可以多次提交一道题目，并获得实时评测结果。

在 IOI，XCPC，Ledo 赛制下，选手可以在比赛时看到排行榜。

OI 赛制所有题目均以最后一次递交为准，特别地，请避免编译错误。

OI 赛制排名规则为：总分高的排在前面，总分相等则排名相同。

XCPC 赛制中，每次错误提交会给题目增加 20 分钟的罚时。

XCPC 赛制排名规则为：通过题目数多的排在前面，通过题目数相同的做题耗时（含罚时）少的排在前。

Ledo 赛制下，多次提交会导致选手的得分被扣除，排行榜将显示用户的最高得分。

Ledo 赛制下，每道题的最终得分为： $s \\times \\max(0.95^{n}, 0.7)$ 。$s,n$ 分别代表本次得分和本次提交前的尝试次数。

Ledo 排名规则为：按照如上规则折算后的分数从高到低排名。

IOI(Strict) 赛制下，每道题的排行榜得分将为用户每个子任务在所有提交中的最大得分的和。

时间与空间限制以题目说明为准，默认限制参见[Limitations](#limits)。
`.trim(),
  },
  {
    id: 'acratio',
    title: 'Accepted Ratio',
    content: '通过率的影响极其恶劣，HNTOU OJ 不提供也不承认通过率。',
  },
  {
    id: 'rp',
    title: 'RP Algorithm',
    content: 'RP 可由题目，活动，比赛等获得。',
  },
  {
    id: 'pbmdiff',
    title: 'Difficulty Algorithm',
    content: `
HNTOU OJ 中题目的难度，根据递交数、通过率以及每个递交的递交时间和评测结果，通过算法计算得出。

因此，请注意以下几点：

1. 一般地，难度的数值越大，该题目越难。
2. 新题目的难度可能不准确；在题目获得大量递交之后，难度才会变得较为准确。
3. 越早递交评测的用户代码的评测结果对题目难度影响越大。
4. 题目的难度由算法计算得出，有可能出现不准确的结果。
`.trim(),
  },
  {
    id: 'upload',
    title: 'Dataset Format',
    content: '详见[配置文档](https://hydro.js.org/docs/Hydro/user/testdata)',
  },
  {
    id: 'lostpass',
    title: 'Forgot Password and/or Username',
    content: `
如果您无法登录，请仔细想想，是不是用户名记错了。比如，自己原本想要注册的用户名已经被注册，所以使用了一个带有前和/或后缀的用户名。

如果您确信您的账号被盗或者忘记了账号和/或密码，请及时[重置密码或找回用户名](/lostpass)。
`.trim(),
  },
  {
    id: 'markdown',
    title: 'Markdown',
    content: `
HNTOU OJ 的 Markdown 区域使用 [CommonMark](http://commonmark.org/help/) 语法，并扩展了以下功能：

- 基于 [Katex](https://onemathematicalcat.org/MathJaxDocumentation/TeXSyntax.htm) 语法的数学公式支持。
- 使用 \`@[](/user/uid)\` 提及用户。
- 使用 \`==text==\` 高亮文本。
- 使用 \`![alt](url =100x100)\` 设置嵌入图片的大小。
- 使用 \`@[video](https://.../a.mp4)\` 嵌入视频文件。
- 使用 \`@[bilibili](BVxxx)\` 嵌入站外视频。
- 使用 \`@[pdf](https://.../a.pdf)\` 嵌入 PDF 文件。
- 在题目/比赛/作业/训练中，可使用 \`file://文件名\` 的链接格式引用对应的附件。（推荐）
- 支持使用一部分 HTML 标签。
`.trim(),
  },
];

export default function WikiHelpPage() {
  const { t } = useI18n();
  const ui = useUiContext();
  const name = ui.domain?.name || ui.serverName || 'HNTOU OJ';

  return (
    <Stack gap="lg">
      <Title order={2}>{t('Help')}</Title>
      {HELP_SECTIONS.map((section) => (
        <Paper key={section.id} withBorder p="lg" className="hydro-content-card">
          <Title order={3} id={section.id} mb="md">{t(section.title)}</Title>
          <MarkdownRenderer content={section.content.replace(/\{\{ name \}\}/g, name)} />
        </Paper>
      ))}
    </Stack>
  );
}
