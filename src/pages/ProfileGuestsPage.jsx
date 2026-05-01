import { Navigate } from 'react-router-dom';
import GuestSlotsPanel from '@/components/GuestSlotsPanel';
import { isGuest } from '@/lib/authStore';

export default function ProfileGuestsPage() {
  if (isGuest()) return <Navigate to="/" replace />;
  return (
    <div className="max-w-2xl mx-auto p-6">
      <GuestSlotsPanel />
    </div>
  );
}
