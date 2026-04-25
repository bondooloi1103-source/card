import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export function useCollection() {
  const [collection, setCollection] = useState(null); // null = loading
  const [collectionId, setCollectionId] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (!user) return;
      setUserId(user.id);
      base44.entities.Collection.filter({ user_id: user.id }, '-created_date', 1)
        .then(list => {
          if (list.length > 0) {
            setCollection(list[0]);
            setCollectionId(list[0].id);
          } else {
            setCollection({ user_id: user.id, fig_ids: [], earned_at: {} });
          }
        });
    }).catch(() => setCollection({ user_id: null, fig_ids: [], earned_at: {} }));
  }, []);

  const hasCard = (figId) => collection?.fig_ids?.includes(figId) ?? false;

  const earnCard = async (figId) => {
    if (!userId || hasCard(figId)) return false;
    const newIds = [...(collection?.fig_ids || []), figId];
    const newEarned = { ...(collection?.earned_at || {}), [figId]: new Date().toISOString() };
    const updated = { ...collection, fig_ids: newIds, earned_at: newEarned };

    if (collectionId) {
      await base44.entities.Collection.update(collectionId, { fig_ids: newIds, earned_at: newEarned });
    } else {
      const created = await base44.entities.Collection.create({
        user_id: userId,
        fig_ids: newIds,
        earned_at: newEarned,
      });
      setCollectionId(created.id);
    }
    setCollection(updated);
    return true;
  };

  return {
    collection,
    hasCard,
    earnCard,
    total: collection?.fig_ids?.length ?? 0,
    loading: collection === null,
  };
}
