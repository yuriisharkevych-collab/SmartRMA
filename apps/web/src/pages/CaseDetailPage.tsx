import { useParams } from 'react-router-dom';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <PlaceholderPage title={`Sprawa ${id}`} prototypeRef="case-detail.html" />;
}
