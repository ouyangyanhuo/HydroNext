import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { DataTable } from '@/components/common/data-table';
import { FileDropzone } from '@/components/common/file-dropzone';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

function formatSize(size?: number) {
  if (!size) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function totalSize(files: any[]) {
  return files.reduce((sum, file) => sum + (file.size || 0), 0);
}

function FileSection({
  title,
  description,
  files,
  type,
  pid,
  canUpload,
  onComplete,
}: {
  title: string;
  description: string;
  files: any[];
  type: 'testdata' | 'additional_file';
  pid: string | number;
  canUpload: boolean;
  onComplete: () => void;
}) {
  const { t } = useI18n();

  const columns = [
    {
      key: 'name',
      title: t('Filename'),
      render: (file: any) => (
        <Link
          href={`/p/${pid}/file/${encodeURIComponent(file.name)}?type=${type}`}
          className="hydro-subtle-link"
        >
          <Text size="sm" fw={600}>{file.name}</Text>
        </Link>
      ),
    },
    {
      key: 'size',
      title: t('Size'),
      width: 120,
      align: 'right' as const,
      render: (file: any) => <Text size="xs" c="dimmed">{formatSize(file.size)}</Text>,
    },
  ];

  return (
    <Card withBorder p="lg" className="hydro-content-card">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Title order={3} size="h4">{title}</Title>
            <Text size="sm" c="dimmed" mt={4}>{description}</Text>
          </div>
          <Group gap="xs">
            <Badge variant="light">{files.length} {t('files')}</Badge>
            <Badge variant="light" color="gray">{formatSize(totalSize(files))}</Badge>
          </Group>
        </Group>

        <DataTable
          columns={columns}
          data={files.map((file) => ({ ...file, _id: `${type}:${file.name}` }))}
          emptyMessage={t('No files')}
        />

        {canUpload && (
          <FileDropzone
            action={`/p/${pid}/files`}
            fields={{ type }}
            onComplete={onComplete}
          />
        )}
      </Stack>
    </Card>
  );
}

export default function ProblemFilesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const testdata = args.testdata || [];
  const additionalFiles = args.additional_file || [];
  const reference = args.reference;
  const pid = pdoc.pid || pdoc.docId;
  const refresh = () => navigate(window.location.href);

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Files')} - ${pdoc.pid}. ${pdoc.title}`} />
      {reference && (
        <Card withBorder p="md" className="hydro-content-card">
          <Group justify="space-between" gap="md">
            <div>
              <Text fw={700}>{t('This is a copy of another problem.')}</Text>
              <Text size="sm" c="dimmed">{reference.domainId}/{reference.pid}</Text>
            </div>
            <Button
              component={Link as any}
              href={`/d/${reference.domainId}/p/${reference.pid}`}
              variant="light"
              size="xs"
            >
              {t('Source')}
            </Button>
          </Group>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <FileSection
          title={t('Testdata')}
          description={t('Input, output, and config files used by the judge.')}
          files={testdata}
          type="testdata"
          pid={pid}
          canUpload={!reference}
          onComplete={refresh}
        />
        <FileSection
          title={t('Additional Files')}
          description={t('Public attachments shown with this problem.')}
          files={additionalFiles}
          type="additional_file"
          pid={pid}
          canUpload={!reference}
          onComplete={refresh}
        />
      </SimpleGrid>
    </Stack>
  );
}
