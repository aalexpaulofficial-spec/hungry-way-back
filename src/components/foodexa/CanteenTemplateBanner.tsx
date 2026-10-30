import { foodImage } from "@/lib/foodexa-images";

type CanteenTemplateBannerProps = {
  imageUrl?: string | null;
  heading?: string | null;
  description?: string | null;
  canteenName: string;
  universityName: string;
  onOrder?: () => void;
  preview?: boolean;
};

export function CanteenTemplateBanner({
  imageUrl,
  heading,
  description,
  canteenName,
  universityName,
  onOrder,
  preview = false,
}: CanteenTemplateBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-primary/30">
      <img src={imageUrl || foodImage("food-indian")} alt="" className="h-52 w-full object-cover opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute bottom-5 left-5 right-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-bright">{canteenName} · {universityName}</p>
        <h2 className="display mt-1 text-3xl">{heading?.trim() || "Skip the queue."}</h2>
        {description?.trim() && <p className="mt-2 max-w-xl text-sm text-foreground/90">{description.trim()}</p>}
        <button type="button" onClick={onOrder} disabled={preview} className="mt-3 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground disabled:cursor-default">
          Order now ↗
        </button>
      </div>
    </div>
  );
}
