export type BannerCrop = { x: number; y: number; zoom: number };

export const DEFAULT_BANNER_CROP: BannerCrop = { x: 50, y: 50, zoom: 1 };

const boundedNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
};

export function normalizeBannerCrop(value?: Partial<BannerCrop> | null): BannerCrop {
  return {
    x: boundedNumber(value?.x, DEFAULT_BANNER_CROP.x, 0, 100),
    y: boundedNumber(value?.y, DEFAULT_BANNER_CROP.y, 0, 100),
    zoom: boundedNumber(value?.zoom, DEFAULT_BANNER_CROP.zoom, 1, 3),
  };
}

export function moveBannerCrop(start: BannerCrop, deltaX: number, deltaY: number, width: number, height: number): Pick<BannerCrop, "x" | "y"> {
  if (width <= 0 || height <= 0 || ![deltaX, deltaY, width, height].every(Number.isFinite)) {
    return { x: start.x, y: start.y };
  }
  return {
    x: boundedNumber(start.x - (deltaX / width) * 100, start.x, 0, 100),
    y: boundedNumber(start.y - (deltaY / height) * 100, start.y, 0, 100),
  };
}
