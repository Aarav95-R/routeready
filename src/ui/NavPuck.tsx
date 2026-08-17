import { View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { mapColors } from "./mapStyle";

export const PUCK_SIZE = 88;

type Props = {
  /**
   * Degrees to rotate the arrow, relative to the map's current bearing. On the
   * navigation map that bearing is only ever set by setCamera — rotate gestures
   * are disabled there — so screen-up is always the driver's heading and 0 is
   * right whether or not the camera is following. Kept as a prop for any caller
   * that does not control the bearing.
   */
  rotation?: number;
};

// Three stacked layers, the way Waze builds it: a soft grey pad that gives
// the vehicle a footprint on the road, a white disc, and the arrow. The pad
// is translucent so the road underneath still shows through.
export function NavPuck({ rotation = 0 }: Props) {
  return (
    <View testID="nav-puck" style={{ width: PUCK_SIZE, height: PUCK_SIZE, transform: [{ rotate: `${rotation}deg` }] }}>
      <Svg width={PUCK_SIZE} height={PUCK_SIZE} viewBox="0 0 88 88">
        <Ellipse testID="puck-pad" cx={44} cy={46} rx={34} ry={27} fill="#221F1C" opacity={0.1} />
        <Ellipse cx={44} cy={46} rx={25} ry={20} fill="#221F1C" opacity={0.08} />
        <Circle testID="puck-disc" cx={44} cy={44} r={20} fill="#FFFFFF" />
        <Path
          testID="puck-arrow"
          d="M44 29 L56 58 L44 51 L32 58 Z"
          fill={mapColors.routeCore}
          stroke={mapColors.routeCasing}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
