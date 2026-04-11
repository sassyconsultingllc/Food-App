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
  // Stable key for the effect — uses the length + a checksum-ish of
  // the first and last URL so two arrays with the same content produce
  // the same key without depending on `.join("|")` (which collides on
  // URLs containing a literal `|`).
  const photosKey = useMemo(() => {
    const list = photos || [];
    if (!list.length) return "";
    return `${list.length}:${list[0]}:${list[list.length - 1]}`;
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
