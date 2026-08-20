import Svg, { Line, Rect } from "react-native-svg";
import type { ManoeuvreSlug } from "@/lib/manoeuvreView";
import { colors } from "@/ui/theme";

/**
 * A manoeuvre at 46pt, for the list.
 *
 * The two bay parks are the reason this exists. They end in the same bay,
 * their names differ by one word, and as two lines of text they read as the
 * same row twice. Drawn, they differ in exactly one mark — which end of the
 * car carries the windscreen — and that mark *is* the difference between the
 * manoeuvres.
 *
 * Deliberately not a shrunk `ManoeuvreDiagram`: the full scene at this size
 * is four grey smudges. These are separate drawings that say one thing each.
 */

const KERB = "#C9C3B8";
const OTHER = "#CFC8BC";
const ROOF = "#0F5C40";
const GLASS = "#8ED6B8";

/** Bay walls, shared by the two car-park glyphs. */
const bayWalls = [
  <Line key="l" x1={10} y1={8} x2={10} y2={34} stroke={KERB} strokeWidth={2} />,
  <Line key="m" x1={24} y1={8} x2={24} y2={34} stroke={KERB} strokeWidth={2} />,
  <Line key="r" x1={38} y1={8} x2={38} y2={34} stroke={KERB} strokeWidth={2} />,
  <Line key="b" x1={10} y1={8} x2={38} y2={8} stroke={KERB} strokeWidth={2} />,
  <Rect key="o" x={13} y={11} width={8} height={20} rx={2.5} fill={OTHER} />,
  <Rect key="c" x={27} y={11} width={8} height={20} rx={2.5} fill={colors.accent} />,
];

function Glyph({ slug }: { slug: ManoeuvreSlug }) {
  switch (slug) {
    case "parallel":
      return (
        <>
          <Line x1={0} y1={13} x2={48} y2={13} stroke={KERB} strokeWidth={2} />
          <Rect x={2} y={16} width={12} height={8} rx={2.5} fill={OTHER} />
          <Rect x={34} y={16} width={12} height={8} rx={2.5} fill={OTHER} />
          <Rect x={17} y={16} width={14} height={8} rx={2.5} fill={colors.accent} />
          <Rect testID="thumb-glass" x={26} y={17.5} width={3} height={5} rx={1} fill={GLASS} />
        </>
      );
    case "bay-reverse":
      // Nose out: the windscreen sits at the mouth of the bay.
      return (
        <>
          {bayWalls}
          <Rect testID="thumb-glass" x={28.5} y={26} width={5} height={3} rx={1} fill={GLASS} />
        </>
      );
    case "bay-forward":
      // Nose in: the windscreen sits at the back of it.
      return (
        <>
          {bayWalls}
          <Rect testID="thumb-glass" x={28.5} y={13} width={5} height={3} rx={1} fill={GLASS} />
        </>
      );
    case "pull-up-right":
      // Both kerbs, and the car on the far one. The only glyph where the car
      // is below the centre line.
      return (
        <>
          <Line x1={0} y1={9} x2={48} y2={9} stroke={KERB} strokeWidth={2} />
          <Line x1={0} y1={39} x2={48} y2={39} stroke={KERB} strokeWidth={2} />
          <Line x1={0} y1={24} x2={48} y2={24} stroke={ROOF} strokeWidth={1.6} strokeOpacity={0.25} strokeDasharray="4 4" />
          <Rect x={17} y={30} width={14} height={8} rx={2.5} fill={colors.accent} />
          <Rect testID="thumb-glass" x={26} y={31.5} width={3} height={5} rx={1} fill={GLASS} />
        </>
      );
  }
}

export function ManoeuvreThumb({ slug, size = 46 }: { slug: ManoeuvreSlug | null; size?: number }) {
  return (
    <Svg
      testID="manoeuvre-thumb"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      style={{ borderRadius: 8, backgroundColor: colors.drawing }}
    >
      {/* A name with no glyph keeps the tile, so the names below stay on one
          margin rather than stepping in and out down the list. */}
      {slug !== null && <Glyph slug={slug} />}
    </Svg>
  );
}
