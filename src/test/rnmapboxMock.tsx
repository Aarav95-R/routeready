// Stand-in for @rnmapbox/maps, which needs a native map. Every element becomes
// a plain View tagged with its kind and id, which is all the NavMap tests read:
// they are about which sources and layers are *mounted*, not about what the map
// draws.
import { forwardRef, createElement, useImperativeHandle } from "react";
import { View } from "react-native";

// `shape` is forwarded so the tests can read what each source was handed.
const stub = (kind: string) => {
  const Stub = forwardRef<unknown, any>(({ children, id, shape }, ref) =>
    createElement(View as any, { ref, testID: `${kind}:${id ?? ""}`, shape }, children)
  );
  Stub.displayName = kind;
  return Stub;
};

export const MapView = stub("map");

// Camera is imperative rather than declarative: callers drive it through a
// ref (setCamera, fitBounds, ...), not through props a plain View stub could
// stand in for. NavMap and CentresMap both call these directly on the ref, so
// the stub answers with no-ops instead of a bare host-component instance,
// which has neither method and would throw the moment a test scrolls or taps
// recentre.
const CameraStub = forwardRef<unknown, any>((_props, ref) => {
  useImperativeHandle(ref, () => ({
    setCamera: () => {},
    fitBounds: () => {},
    flyTo: () => {},
    moveTo: () => {},
    zoomTo: () => {},
  }));
  return createElement(View as any, { testID: "camera:" });
});
CameraStub.displayName = "camera";
export const Camera = CameraStub;

export const ShapeSource = stub("source");
export const LineLayer = stub("layer");
export const CircleLayer = stub("layer");
export const FillLayer = stub("layer");
export const BackgroundLayer = stub("layer");
export const MarkerView = stub("marker");
export const SymbolLayer = stub("layer");
