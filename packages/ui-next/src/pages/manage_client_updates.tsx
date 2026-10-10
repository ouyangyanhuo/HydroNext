import { Alert, Badge, Card, FileInput, Grid, Group, Pagination, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { LongSelect } from '@/components/common/select';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import {
  defaultDraft, downloadUpdateJson, packageUrl, previewUpdate, UPDATE_KINDS, UPDATE_URL_FIELDS,
  type UpdateAsset, type UpdateDraft, type UpdateKind,
} from '@/utils/client-update';
import { proctorError, proctorRequest } from '@/utils/proctor';

const labels: Record<UpdateKind, string> = { asar: 'Hot update ASAR', installer: 'Windows installer', portable: 'Windows portable package', config: 'Remote client configuration' };

export default function ManageClientUpdatesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const allowed = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const endpoint = buildUrl('manage_client_updates');
  const [draft, setDraft] = useState<UpdateDraft>(() => ({ ...defaultDraft, ...args.draft }));
  const [revision, setRevision] = useState<number>(args.revision);
  const [manifest, setManifest] = useState<Record<string, any> | null>(args.manifest);
  const [publishedAt, setPublishedAt] = useState(args.publishedAt);
  const [publishedOrigin, setPublishedOrigin] = useState(args.publishedOrigin || args.draft.origin);
  const [publishedAssets, setPublishedAssets] = useState<string[]>(args.publishedAssets || []);
  const [activeAssets, setActiveAssets] = useState<string[]>(args.activeAssets || []);
  const [deleting, setDeleting] = useState<UpdateAsset | null>(null);
  const [library, setLibrary] = useState(args);
  const [knownAssets, setKnownAssets] = useState<UpdateAsset[]>([...args.assets, ...args.selectedAssets]);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<UpdateKind>('asar');
  const [uploadVersion, setUploadVersion] = useState(args.draft.version);
  const [query, setQuery] = useState(args.q || '');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [showPublished, setShowPublished] = useState(false);
  const [previewDate] = useState(() => new Date().toISOString());
  const assets = useMemo(() => Array.from(new Map(knownAssets.map((row) => [row.id, row])).values()), [knownAssets]);
  const preview = useMemo(() => previewUpdate(draft, assets, previewDate), [draft, assets, previewDate]);
  const json = showPublished && manifest ? manifest : preview;
  const origin = (() => {
    try {
      return new URL(draft.origin).origin;
    } catch { return ''; }
  })();
  const manifestUrl = origin ? `${origin}/client-updates/version.json` : '';
  const formatError = (error: any) => error?.name === 'ValidationError' && typeof error.params?.[2] === 'string'
    ? t(error.params[2]) : t(proctorError(error));
  const chooseFile = (value: File | null) => {
    if (!value) {
      setFile(null);
      return;
    }
    const max = kind === 'config' ? 256 * 1024 : 240 * 1024 * 1024;
    const extension = kind === 'config' ? '.json' : kind === 'asar' ? '.asar' : '.exe';
    if (!value.size || value.size > max || !value.name.toLowerCase().endsWith(extension)) {
      notifications.show({ title: t('Operation failed'), color: 'red',
        message: t(!value.size || value.size > max ? 'Update package is too large or empty.' : 'Invalid update package.') });
      return;
    }
    setFile(value);
  };

  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try { await action(); } catch (error: any) {
      notifications.show({ title: t('Operation failed'), message: t(error.message || 'Operation failed'), color: 'red' });
    } finally { pending.current = false; setBusy(false); }
  };
  const update = <K extends keyof UpdateDraft>(key: K, value: UpdateDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setShowPublished(false);
  };
  const selectPackage = (key: UpdateKind, id: string) => {
    setDraft((current) => ({ ...current, [key]: id, ...(id ? { [UPDATE_URL_FIELDS[key]]: '' } : {}) }));
    setShowPublished(false);
  };
  const enterPackageUrl = (key: UpdateKind, url: string) => {
    setDraft((current) => ({ ...current, [UPDATE_URL_FIELDS[key]]: url, ...(url ? { [key]: '' } : {}) }));
    setShowPublished(false);
  };
  const save = (publish: boolean) => run(async () => {
    const result = await proctorRequest(endpoint, { operation: publish ? 'publish' : 'save', draft, revision }, formatError);
    setDraft(result.draft);
    setRevision(result.revision);
    setManifest(result.manifest);
    setPublishedAt(result.publishedAt);
    setPublishedOrigin(result.publishedOrigin || '');
    setPublishedAssets(result.publishedAssets);
    setActiveAssets(result.activeAssets || []);
    setShowPublished(publish);
    setConfirm(false);
    notifications.show({ title: t(publish ? 'Update published' : 'Draft saved'), message: '', color: 'green' });
  });
  const load = (page: number, q = library.q || '') => run(async () => {
    const response = await fetch(buildUrl('manage_client_updates', {}, { page: String(page), q }), { cache: 'no-store', headers: { Accept: 'application/json' } });
    const result = await response.json();
    if (!response.ok || result.error || !Array.isArray(result.assets)) throw new Error(formatError(result.error));
    setLibrary(result);
    // Keep selections available even when the package library moves to another page.
    setKnownAssets((current) => [...current.filter((row) => UPDATE_KINDS.some((key) => draft[key] === row.id)), ...result.assets]);
  });
  const deletePackage = () => run(async () => {
    if (!deleting) return;
    const result = await proctorRequest(endpoint, { operation: 'delete', id: deleting.id, revision }, formatError);
    setRevision(result.revision);
    setPublishedAssets(result.publishedAssets);
    setKnownAssets((current) => current.filter((asset) => asset.id !== result.deletedId));
    setDraft((current) => {
      const next = { ...current };
      for (const key of UPDATE_KINDS) if (next[key] === result.deletedId) next[key] = '';
      for (const key of [...Object.values(UPDATE_URL_FIELDS), 'asarFallbackUrl', 'configFallbackUrl'] as const) {
        try {
          if (new URL(next[key]).pathname.includes(`/client-updates/packages/${result.deletedId}/`)) next[key] = '';
        } catch { /* Empty or in-progress URL input must not erase other unsaved settings. */ }
      }
      return next;
    });
    setDeleting(null);
    // Update local state first so a failed refresh cannot leave a deleted option selectable.
    setLibrary((current: any) => ({ ...current, assets: current.assets.filter((asset: UpdateAsset) => asset.id !== result.deletedId),
      count: Math.max(0, current.count - 1) }));
    notifications.show({ title: t('Package deleted'), color: result.cleanupPending ? 'orange' : 'green',
      message: result.cleanupPending ? t('The package is unavailable. File cleanup will be retried automatically.') : '' });
    const response = await fetch(buildUrl('manage_client_updates', {}, { page: String(library.page || 1), q: library.q || '' }),
      { cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || data.error || !Array.isArray(data.assets)) throw new Error(formatError(data.error));
    setLibrary(data);
    setKnownAssets((current) => [...current, ...data.assets]);
  });
  const upload = () => run(async () => {
    if (!file) return;
    await proctorRequest(endpoint, { operation: 'authorize' }, formatError);
    const form = new FormData();
    form.set('operation', 'upload');
    form.set('kind', kind);
    form.set('version', uploadVersion);
    form.set('file', file);
    const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', headers: { Accept: 'application/json' }, body: form });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(formatError(result.error));
    setKnownAssets((current) => [result.asset, ...current]);
    selectPackage(kind, result.asset.id);
    setFile(null);
    notifications.show({ title: t('Upload completed'), message: result.asset.bundleError ? t(result.asset.bundleError) : t('Upload is a draft. Publish to make it available to clients.'),
      color: result.asset.bundleError ? 'orange' : 'green' });
    // Preserve filtering and refresh the current library after an upload.
    const list = await fetch(buildUrl('manage_client_updates', {}, { page: '1', q: library.q || '' }), { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (list.ok) {
      const data = await list.json();
      if (Array.isArray(data.assets)) setLibrary(data);
    }
  });

  if (!allowed) return <Text>{t('Access Denied')}</Text>;
  return <Stack gap="lg">
    <PageHeader title={t('Update settings')}>
      <Badge color={manifest ? 'green' : 'gray'} variant="light">{manifest ? `${t('Published')} ${manifest.version} · ${manifest.buildVersion || '—'}` : t('Not published')}</Badge>
    </PageHeader>
    <Alert color="orange">{t('The client must support buildVersion comparison before using this manifest for update ordering. Publishing lower values is allowed; clients do not automatically downgrade.')}</Alert>
    <Grid><Grid.Col span={{ base: 12, lg: 8 }}><Card withBorder className="hydro-content-card" p="lg">
      <Stack gap="md">
        <Title order={3}>{t('Release configuration')}</Title>
        <TextInput
          label={t('Public OJ origin')}
          description={t('Use HTTPS without a path. Published URLs do not depend on the current domain.')}
          placeholder="https://oj.example.com"
          value={draft.origin}
          disabled={busy}
          onChange={(event) => update('origin', event.currentTarget.value)}
          maxLength={2048} />
        <Group grow align="flex-start">
          <TextInput label={t('Release version')} description="1.2.3" value={draft.version} disabled={busy} maxLength={23} onChange={(event) => update('version', event.currentTarget.value)} />
          <TextInput
            label={t('Minimum client version')}
            description={t('Minimum client compatibility version; independent of update ordering.')}
            value={draft.minClientVersion}
            disabled={busy}
            maxLength={23}
            onChange={(event) => update('minClientVersion', event.currentTarget.value)} />
        </Group>
        <TextInput
          label={t('Internal build version')}
          description={t('buildVersion: YYYYMMDDNN, for example 2026101001. Used for update ordering, not the display version.')}
          placeholder="2026101001"
          value={draft.buildVersion}
          disabled={busy}
          maxLength={10}
          inputMode="numeric"
          onChange={(event) => update('buildVersion', event.currentTarget.value)} />
        <TextInput label={t('Release description')} value={draft.description} disabled={busy} maxLength={2000} onChange={(event) => update('description', event.currentTarget.value)} />
        <Textarea
          label={t('Changelog')}
          description={t('One change per line.')}
          minRows={4}
          value={draft.changelog.join('\n')}
          disabled={busy}
          onChange={(event) => update('changelog', event.currentTarget.value.split('\n'))} />
        <Grid>{UPDATE_KINDS.map((key) => <Grid.Col key={key} span={{ base: 12, sm: 6 }}>
          <Stack gap="xs"><LongSelect
            label={t(labels[key])}
            clearable
            disabled={busy}
            value={draft[key] || null}
            placeholder={t('Choose an uploaded package')}
            data={assets.filter((asset) => asset.kind === key).map((asset) => ({ value: asset.id, label: `${asset.version} · ${asset.filename} · ${asset.sha256.slice(0, 8)}` }))}
            onChange={(value) => selectPackage(key, value || '')}
            nothingFoundMessage={t('Use the package library below to find older packages.')} />
          <TextInput
            label={`${t(labels[key])} · ${t('Download URL')}`}
            description={t('Enter a URL or choose an uploaded package; only one source is used.')}
            placeholder="https://cdn.example.com/package"
            value={draft[UPDATE_URL_FIELDS[key]]}
            disabled={busy}
            maxLength={2048}
            onChange={(event) => enterPackageUrl(key, event.currentTarget.value)} /></Stack>
        </Grid.Col>)}</Grid>
        {!!draft.asarUrl && <Group grow align="flex-start">
          <TextInput
            label={t('ASAR size in bytes')}
            value={draft.asarSize || ''}
            inputMode="numeric"
            disabled={busy}
            maxLength={9}
            onChange={(event) => update('asarSize', Number(event.currentTarget.value))} />
          <TextInput
            label="ASAR SHA-256"
            value={draft.asarSha256}
            disabled={busy}
            maxLength={64}
            onChange={(event) => update('asarSha256', event.currentTarget.value)} />
        </Group>}
        <TextInput label={t('ASAR fallback URL')} value={draft.asarFallbackUrl} disabled={busy} onChange={(event) => update('asarFallbackUrl', event.currentTarget.value)} maxLength={2048} />
        <TextInput label={t('Configuration fallback URL')} value={draft.configFallbackUrl} disabled={busy} onChange={(event) => update('configFallbackUrl', event.currentTarget.value)} maxLength={2048} />
        {assets.filter((asset) => asset.bundleError && draft[asset.kind] === asset.id).map((asset) => <Alert color="red" key={asset.id}>{t(asset.bundleError!)}</Alert>)}
        <Text size="sm" c="dimmed">{t('All version values may be lowered when publishing. Use a new, higher buildVersion to distribute rollback code to newer clients. Proctor version requirements are unchanged.')}</Text>
        <Group justify="flex-end"><Button variant="default" loading={busy} onClick={() => void save(false)}>{t('Save draft')}</Button>
          <Button disabled={busy} onClick={() => setConfirm(true)}>{t('Publish update')}</Button></Group>
      </Stack>
    </Card></Grid.Col><Grid.Col span={{ base: 12, lg: 4 }}><Stack gap="lg">
      <Card withBorder className="hydro-content-card" p="lg"><Stack gap="md">
        <Title order={3}>{t('Upload update package')}</Title>
        <LongSelect
          label={t('Package type')}
          searchable={false}
          allowDeselect={false}
          value={kind}
          disabled={busy}
          data={UPDATE_KINDS.map((key) => ({ value: key, label: t(labels[key]) }))}
          onChange={(value) => {
            if (!value) return;
            setKind(value as UpdateKind);
            setFile(null);
          }} />
        <TextInput label={t('Package version')} value={uploadVersion} disabled={busy} maxLength={23} onChange={(event) => setUploadVersion(event.currentTarget.value)} />
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy && event.dataTransfer.files.length === 1) chooseFile(event.dataTransfer.files[0]);
          }}>
          <FileInput
            label={t('Update file')}
            placeholder={t('Choose or drop one update file')}
            value={file}
            disabled={busy}
            onChange={chooseFile}
            accept={kind === 'asar' ? '.asar' : kind === 'config' ? '.json' : '.exe'}
            clearable
            leftSection={<IconUpload size={16} />} />
        </div>
        <Text size="xs" c="dimmed">{kind === 'config' ? t('JSON up to 256 KiB; requires exam.targetUrl.') : t('Packages up to 240 MiB. ASAR must include package.json and the application entry point.')}</Text>
        <Button loading={busy} disabled={!file} leftSection={<IconUpload size={16} />} onClick={() => void upload()}>{t('Upload')}</Button>
        <Text size="xs" c="dimmed">{t('Authorization may require reselecting the file. Uploaded files are private until published; historical packages can be deleted.')}</Text>
      </Stack></Card>
      <Card withBorder className="hydro-content-card" p="lg"><Stack gap="md">
        <Title order={3}>{t('Client update URLs')}</Title>
        <TextInput label={t('Manifest URL')} description="updater.versionUrl / updater.fallbackVersionUrl" value={manifestUrl} readOnly />
        {publishedAt && <Text size="sm" c="dimmed">{t('Last published')}: {new Date(publishedAt).toLocaleString()}</Text>}
        <Text size="sm" c="dimmed">{t('The manifest returns 404 until the first publication. Put this URL in the client build configuration.')}</Text>
        {manifest && <TextInput label={t('Published manifest URL')} value={publishedOrigin ? `${publishedOrigin}/client-updates/version.json` : ''} readOnly />}
        {manifest && [manifest.hotUpdate?.asarUrl, manifest.fullUpdate?.installerUrl, manifest.fullUpdate?.portableUrl, manifest.config?.url]
          .filter(Boolean).map((url: string, index: number) => <TextInput key={`${index}:${url}`} label={`${t('Published package URL')} ${index + 1}`} value={url} readOnly />)}
      </Stack></Card>
    </Stack></Grid.Col></Grid>
    <Card withBorder className="hydro-content-card" p="lg"><Stack gap="md">
      <Group justify="space-between"><Title order={3}>{t('Update package library')}</Title><Badge variant="light">{library.count || 0}</Badge></Group>
      <form onSubmit={(event) => { event.preventDefault(); void load(1, query); }}><Group>
        <TextInput className="flex-1" placeholder={t('Search package filename or version')} value={query} disabled={busy} maxLength={80} onChange={(event) => setQuery(event.currentTarget.value)} />
        <Button variant="light" type="submit" loading={busy}>{t('Search')}</Button>
      </Group></form>
      <Table.ScrollContainer minWidth={780}><Table highlightOnHover><Table.Thead><Table.Tr>
        {['Package', 'Version', 'Size', 'Package URL', 'Actions'].map((label) => <Table.Th key={label}>{t(label)}</Table.Th>)}
      </Table.Tr></Table.Thead><Table.Tbody>{(library.assets as UpdateAsset[]).map((asset) => <Table.Tr key={asset.id}>
        <Table.Td><Text size="sm" fw={500}>{asset.filename}</Text><Badge size="xs" color={publishedAssets.includes(asset.id) ? 'green' : 'gray'} variant="light">{t(publishedAssets.includes(asset.id) ? 'Published' : 'Draft')}</Badge></Table.Td>
        <Table.Td>{asset.version}</Table.Td><Table.Td>{(asset.size / 1024 / 1024).toFixed(2)} MiB</Table.Td>
        <Table.Td><TextInput size="xs" readOnly value={packageUrl(draft.origin, asset)} aria-label={t('Package URL')} w={350} />
          <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere', maxWidth: 350 }}>SHA-256: {asset.sha256}</Text></Table.Td>
        <Table.Td><Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="light" disabled={busy} onClick={() => { setKnownAssets((current) => [...current, asset]); selectPackage(asset.kind, asset.id); }}>{t('Use this package')}</Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            disabled={busy || activeAssets.includes(asset.id)}
            title={activeAssets.includes(asset.id) ? t('Used by the published release') : t('Delete package')}
            onClick={() => setDeleting(asset)}>{t('Delete')}</Button>
        </Group></Table.Td>
      </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
      {!library.assets.length && <Text ta="center" c="dimmed" py="lg">{t('No update packages yet.')}</Text>}
      <Group justify="space-between" className="hydro-paginator"><Text size="xs" c="dimmed">{t('25 packages per page')}</Text>
        <Pagination size="sm" total={library.pageCount || 1} value={library.page || 1} disabled={busy} onChange={(page) => void load(page)} />
      </Group>
    </Stack></Card>
    <Card withBorder className="hydro-content-card" p="lg"><Stack gap="md">
      <Group justify="space-between"><Title order={3}>{t(showPublished ? 'Published JSON' : 'Draft JSON preview')}</Title><Group gap="sm">
        {manifest && <Button variant="default" size="xs" onClick={() => setShowPublished((value) => !value)}>{t(showPublished ? 'View draft' : 'View published')}</Button>}
        <Button variant="light" size="xs" leftSection={<IconDownload size={16} />} onClick={() => downloadUpdateJson(json)}>{t('Download JSON')}</Button>
      </Group></Group>
      {!showPublished && <Text size="xs" c="dimmed">{t('This is an unpublished preview. The server validates it and sets releaseDate when publishing.')}</Text>}
      <Textarea readOnly value={JSON.stringify(json, null, 2)} minRows={16} maxRows={16} styles={{ input: { fontFamily: 'monospace', height: 380, overflow: 'auto' } }} aria-label={t('Update manifest JSON')} />
    </Stack></Card>
    <ConfirmDialog
      opened={!!deleting}
      onClose={() => { if (!busy) setDeleting(null); }}
      loading={busy}
      title={t('Delete package')}
      message={`${deleting?.filename || ''} · ${deleting?.version || ''}\n${t('Deleting this historical package invalidates its download URL and clears related draft selections. Continue?')}`}
      onConfirm={() => void deletePackage()} />
    <ConfirmDialog
      opened={confirm}
      onClose={() => setConfirm(false)}
      loading={busy}
      title={t('Publish update')}
      message={t('Clients will read this release at the next update check. Confirm the version, public URLs and package contents before publishing. Continue?')}
      onConfirm={() => void save(true)} />
  </Stack>;
}
