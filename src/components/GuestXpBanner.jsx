import { isGuest, parentDisplayName } from '@/lib/authStore';
import { useLang } from '@/lib/i18n';

export default function GuestXpBanner({ xp }) {
  const { t } = useLang();
  if (!isGuest()) return null;
  const parent = parentDisplayName();
  if (!parent) return null;
  return (
    <div className="text-sm text-gray-600">
      +{xp} {t('guest.xpBannerSuffix', { parent })}
    </div>
  );
}
