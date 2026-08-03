import { View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";
import { mapColors } from "./mapStyle";

export const PUCK_SIZE = 88;

type Props = {
  /**
   * Degrees to rotate the arrow. While the camera is following, screen-up
   * already is the driver's heading, so this stays 0; it is only used once
   * the driver has panned away from follow mode.
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
        <Ellipse testID="puck-pad" cx={44} cy={46} rx={34} ry={27} fill="#0F172A" opacity={0.1} />
        <Ellipse cx={44} cy={46} rx={25} ry={20} fill="#0F172A" opacity={0.08} />
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
