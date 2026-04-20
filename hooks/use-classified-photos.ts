/**
 * useClassifiedPhotos
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Splits a restaurant's photo array into food photos (for the photo carousel
 * and hero image) and menu photos (for the menu section). Calls the worker's
 * /api/vision/classify proxy — the Vision API key lives only on the server.
 */

import { useEffect, useMemo, useState } from "react";
import {
  classifyPhotos,
  type ClassifiedPhotos,
} from "@/utils/photo-classifier";

export function useClassifiedPhotos(photos: string[] | undefined): ClassifiedPhotos {
  // Stable key for the effect — a simple hash of ALL photo URLs so that
  // any change in the array content (even if length and first/last are
  // the same) triggers re-classification.
  const photosKey = useMemo(() => {
    const list = photos || [];
    if (!list.length) return "";
    // djb2 hash over all URLs joined — cheap and collision-resistant
    // enough for our purposes (triggering an effect, not crypto).
    let hash = 5381;
    for (const url of list) {
      for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
      }
    }
    return `${list.length}:${hash}`;
  }, [photos]);

  const [state, setState] = useState<ClassifiedPhotos>(() => ({
    foodPhotos: photos || [],
    menuPhotos: [],
    heroPhoto: photos?.[0],
    loading: !!photos?.length,
  }));

  useEffect(() => {
    let cancelled = false;
    const list = photos || [];
    if (!list.length) {
      setState({ foodPhotos: [], menuPhotos: [], heroPhoto: undefined, loading: false });
      return;
    }

    // Optimistic initial paint — show all as food photos while we wait
    // for the worker to classify.
    setState({
      foodPhotos: list,
      menuPhotos: [],
      heroPhoto: list[0],
      loading: true,
    });

    classifyPhotos(list, (partial) => {
      if (cancelled) return;
      setState({ ...partial, loading: true });
    })
      .then((final) => {
        if (cancelled) return;
        setState({ ...final, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false }));
      });

    return () => {
      cancelled = true;
    };
  }, [photosKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
