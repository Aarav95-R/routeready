import appJson from "./app.json";

// Dynamic config so the Mapbox build-time download token comes from the
// environment (an EAS secret) rather than being committed.
export default () => {
  const cfg = appJson.expo;
  return {
    ...cfg,
    plugins: cfg.plugins.map((p) =>
      p === "@rnmapbox/maps"
        ? ["@rnmapbox/maps", { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? "" }]
        : p
    ),
  };
};
