// Stand-in for @rnmapbox/maps, which needs a native map. Every element becomes
// a plain View tagged with its kind and id, which is all the NavMap tests read:
// they are about which sources and layers are *mounted*, not about what the map
// draws.
import { forwardRef, createElement, useImperativeHandle, useRef } from "react";
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
// the stub answers with jest.fn()s instead of a bare host-component instance,
// which has neither method and would throw the moment a test scrolls or taps
// recentre. The functions are created once per mount (via useRef, not fresh
// on every render) so their call history is stable across a test, and they
// are also spread onto the rendered View's props — the same "read state back
// off the element" pattern `shape` uses on ShapeSource above — so a test can
// assert on them via screen.getByTestId("camera:").props.setCamera.mock.calls
// without CentresMap/NavMap needing to expose their own internal Camera ref.
const CameraStub = forwardRef<unknown, any>((_props, ref) => {
  const handle = useRef({
    setCamera: jest.fn(),
    fitBounds: jest.fn(),
    flyTo: jest.fn(),
    moveTo: jest.fn(),
    zoomTo: jest.fn(),
  }).current;
  useImperativeHandle(ref, () => handle, [handle]);
  return createElement(View as any, { testID: "camera:", ...handle });
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
