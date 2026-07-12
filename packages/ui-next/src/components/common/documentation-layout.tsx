import { Text, Title } from '@mantine/core';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { useI18n } from '@/hooks/use-i18n';
import { PageHeader } from './page-header';

export interface DocumentationSection {
  id: string;
  title: string;
  content: string;
}

interface DocumentationLayoutProps {
  title: string;
  description?: string;
  sections: DocumentationSection[];
}

export function DocumentationLayout({ title, description, sections }: DocumentationLayoutProps) {
  const { t } = useI18n();

  return (
    <main className="hydro-doc-page">
      <PageHeader title={title} />
      {description && <Text className="hydro-doc-page__description">{description}</Text>}

      <div className="hydro-doc-layout">
        <aside className="hydro-doc-toc" aria-label={t('Overview')}>
          <Text className="hydro-doc-toc__title">{t('Overview')}</Text>
          <nav className="hydro-doc-toc__nav">
            {sections.map((section, index) => (
              <a key={section.id} href={`#${section.id}`} className="hydro-doc-toc__link">
                <span>{String(index + 1).padStart(2, '0')}</span>
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="hydro-doc-article">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="hydro-doc-section">
              <div className="hydro-doc-section__heading">
                <Text component="span" aria-hidden="true">{String(index + 1).padStart(2, '0')}</Text>
                <Title order={3}>{section.title}</Title>
              </div>
              <MarkdownRenderer content={section.content} />
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
