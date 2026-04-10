/**
 * useClassifiedPhotos
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Splits a restaurant's photo array into food photos (for the photo carousel
 * and hero image) and menu photos (for the menu section) by running Google
 * Vision OCR and caching per-URL results.
 */

import { useEffect, useState } from "react";
import {
  classifyPhotos,
  type ClassifiedPhotos,
} from "@/utils/photo-classifier";

const VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_VISION_API_KEY;

export function useClassifiedPhotos(photos: string[] | undefined): ClassifiedPhotos {
  const [state, setState] = useState<ClassifiedPhotos>(() => ({
    foodPhotos: photos || [],
    menuPhotos: [],
    heroPhoto: photos?.[0],
    loading: !!photos?.length && !!VISION_API_KEY,
  }));

  useEffect(() => {
    let cancelled = false;
    const list = photos || [];
    if (!list.length) {
      setState({ foodPhotos: [], menuPhotos: [], heroPhoto: undefined, loading: false });
      return;
    }

    // Optimistic initial paint — show all as food photos
    setState({
      foodPhotos: list,
      menuPhotos: [],
      heroPhoto: list[0],
      loading: !!VISION_API_KEY,
    });

    classifyPhotos(list, VISION_API_KEY, (partial) => {
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
  }, [photos?.join("|")]);

  return state;
}
