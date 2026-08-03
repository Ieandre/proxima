import { useStore } from '../../store/useStore';
import { EmptyState } from './shared';
import { PMView } from './PMView';
import { RoomView } from './RoomView';


export function Conversation() {
  const active = useStore((s) => s.active);
  if (!active) return <EmptyState />;
  if (active.kind === 'pm') return <PMView key={`pm:${active.id}`} peerId={active.id} />;
  return <RoomView key={`room:${active.id}`} roomId={active.id} />;
}

/* ----------------------------------------------------------------------- */
