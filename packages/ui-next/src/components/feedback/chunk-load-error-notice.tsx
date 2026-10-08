import { ButtonBase } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';

/** Native fallback also works when a slot fails outside MantineProvider. */
export function ChunkLoadErrorNotice() {
  const { t } = useI18n();
  return <section
    role="alert"
    className="rounded-xl border p-6"
    style={{ background: 'var(--hydro-surface, #fff)', color: 'var(--hydro-text, #222)', borderColor: 'var(--hydro-border, #ddd)' }}>
    <h2 className="text-lg font-semibold">{t('Page resources could not be loaded.')}</h2>
    <p className="mt-2 text-sm" style={{ color: 'var(--hydro-text-muted, #666)' }}>
      {t('The frontend may have been updated. Check your connection and reload this page.')}
    </p>
    <p className="mt-1 text-sm" style={{ color: 'var(--hydro-text-muted, #666)' }}>
      {t('Save unfinished work before reloading.')}
    </p>
    <ButtonBase
      type="button"
      className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold"
      style={{ color: 'var(--hydro-primary, #1864ab)', borderColor: 'var(--hydro-border, #ddd)' }}
      onClick={() => window.location.reload()}>
      {t('Reload page')}
    </ButtonBase>
  </section>;
}
