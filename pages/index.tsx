import styles from "@/styles/Home.module.css";

import "mapbox-gl/dist/mapbox-gl.css";
import { createRef, useCallback, useEffect, useRef, useState } from "react";

import * as O from "fp-ts/Option";
import * as E from "fp-ts/Either";
import * as A from "fp-ts/Array";
import * as TE from "fp-ts/TaskEither";

import { format } from "date-fns";

// @ts-ignore
import * as io from "socket.io-client";

import MapView, { Marker, MapRef, Layer, Source } from "react-map-gl";
import { constNull, pipe } from "fp-ts/lib/function";

const lat = 37.8;
const lng = -122.4;

const vessel_id = 17;
const device_id = 123456789;

const auth_token =
  "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzdXBlcmFkbWluIiwiaWF0IjoxNjc1MDc2NDU0LCJleHAiOjE2NzUwODM1NTV9.9ii6PQFNKrokA-NJThvM-eCRjPEJulcfsIgI-Q2Ar59POQlVwxHeRLn_HPycNNHa4ufKX0HdSsADm-VxCAsYsA";

const map_props = {
  mapStyle: "mapbox://styles/mapbox/streets-v9",
  initialViewState: {
    zoom: 14,
    latitude: lat,
    longitude: lng,
  },
};

const run = pipe(
  TE.tryCatch(
    () => navigator.permissions.query({ name: "geolocation" }),
    E.toError
  ),
  TE.chainEitherK((permission) =>
    permission.state === "denied"
      ? E.left(new Error("Location permission denied"))
      : E.right(permission)
  )
);

function useLocationPermission() {
  const [error, set_error] = useState<Error | null>(null);
  const [permission, set_permission] = useState<PermissionState | null>(null);

  const request = useCallback(() => {
    run().then(
      E.match(
        (err) => set_error(err),
        (permission) => set_permission(permission.state)
      )
    );
  }, []);

  useEffect(request, [request]);

  return { error, request, permission };
}

function useLocationUpdate(options?: PositionOptions) {
  const watch_id = useRef<number | null>(null);
  const [error, set_error] = useState<GeolocationPositionError | null>(null);
  const [position, set_location] = useState<GeolocationPosition | null>(null);

  const requestUpdate = useCallback(() => {
    const existing = watch_id.current;

    if (existing !== null) {
      navigator.geolocation.clearWatch(existing);
    }

    watch_id.current = navigator.geolocation.watchPosition(
      (position) => set_location(position),
      (err) => set_error(err),
      options
    );
  }, [options]);

  const stop = useCallback(() => {
    const existing = watch_id.current;

    if (existing !== null) {
      navigator.geolocation.clearWatch(existing);
    }
  }, []);

  useEffect(() => {
    const existing = watch_id.current;

    return () => {
      if (existing !== null) {
        navigator.geolocation.clearWatch(existing);
      }
    };
  }, []);

  return { stop, error, requestUpdate, position };
}

export function getServerSideProps() {
  const api_key = process.env.MAPBOX__API_KEY;

  return {
    props: {
      api_key,
    },
  };
}

type Position = {
  id: string;
  angle: number;
  speed: number;
  gpsDate: string;
  gpsTime: number;
  vesselId: number;
  trackerId: number;
  latitude: 6.601577;
  locationId: string;
  longitude: number;
  processingTime: number;
};

export default function Home({ api_key }: { api_key: string }) {
  const { permission } = useLocationPermission();

  const { position, requestUpdate } = useLocationUpdate();

  const { coords } = position ?? {};

  const [positions, set_positions] = useState<Array<Position>>();

  const [local_map, set_local_map] = useState<MapRef | null>(null);
  const [remote_map, set_remote_map] = useState<MapRef | null>(null);

  const [positions_by_device, set_positions_by_device] = useState<
    Map<number, Array<Position>>
  >(new Map());

  // "ws://192.168.153.20:9092/app?token=abc123"
  const [socket] = useState(() => {
    return io("ws://34.172.18.184:8081/app?token=abc123", {
      upgrade: true,
      // path: "/app",
      transports: ["websocket"],
    });
  });

  const maybe_positions = O.fromNullable(positions);

  // ws://34.172.18.184:8081/socket.io/?token=abc123&EIO=3&transport=websocket

  // ws://34.172.18.184:8081/socket.io/?token=abc123&EIO=3&transport=websocket

  // console.log(position);

  useEffect(() => {
    if (permission !== "denied") requestUpdate();
  }, [requestUpdate, permission]);

  useEffect(() => {
    if (position) {
      const { coords } = position;

      const time = format(new Date(position.timestamp), "yyyy-MM-dd HH:mm:ss");

      // const t = encodeURIComponent(time);

      // console.log(time);

      fetch("http://192.168.153.20:8000/webhook/v1/location", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // ...coords,
          // angle: 0,
          gpsTime: time,
          // backlog: false,
          deviceId: device_id,
          vehicleNo: device_id,
          processingTime: time,
          latitude: coords.latitude,
          longitude: coords.longitude,
          // apiKey: "JmOBYcwgbMocPGn0uTSbWDsaHuktxepFqzmhRDyz",
        }),
      })
        .then((r) => {
          console.log("sent", r);
        })
        .catch((r) => {
          console.log("error", r);
        });
    }
  }, [position]);

  useEffect(() => {
    const map = local_map;

    if (map && coords) {
      map.panTo({ lat: coords.latitude, lng: coords.longitude });
    }
  }, [coords, local_map]);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("connected");
    });

    socket.on("connect_error", (err: any) => {
      console.log("connect error", err);

      // if (err.message === "invalid credentials") {
      //   socket.auth.token = "efgh";
      //   socket.connect();
      // }
    });

    socket.on("app/location", (ev: Position) => {
      const map = new Map(positions_by_device);

      const existing = map.get(ev.vesselId) ?? [];

      map.set(ev.vesselId, [...existing, ev]);

      set_positions((p) => [...(p ?? []), ev]);

      set_positions_by_device(map);

      console.log(ev, ev.trackerId === vessel_id);
    });
  }, [socket, positions_by_device.size]);

  console.log([...positions_by_device.keys()]);

  return (
    <div className="h-full p-4 flex gap-4">
      <div className={styles.map}>
        <MapView ref={set_local_map} {...map_props} mapboxAccessToken={api_key}>
          <Marker
            anchor="bottom"
            longitude={coords?.longitude ?? lng}
            latitude={coords?.latitude ?? lat}
          />
        </MapView>
      </div>

      <div className={styles.map}>
        <MapView
          ref={set_remote_map}
          {...map_props}
          mapboxAccessToken={api_key}
        >
          {/* {pipe(
            maybe_positions,
            O.match(constNull, (positions) => {
              return (
                <Source
                  type="geojson"
                  data={{
                    type: "LineString",
                    coordinates: pipe(
                      positions,
                      A.map((position) => {
                        return [position.longitude, position.latitude];
                      })
                    ),
                  }}
                >
                  <Layer
                    {...{
                      id: "line",
                      type: "line",
                      layout: {
                        visibility: "visible",
                      },
                      paint: {
                        "line-width": 5,
                        "line-color": "#ff7676",
                      },
                    }}
                  />
                </Source>
              );
            })
          )} */}

          {pipe(
            [...positions_by_device.entries()],
            A.map(([id, positions]) => {
              return (
                <Source
                  key={id}
                  type="geojson"
                  data={{
                    type: "LineString",
                    coordinates: pipe(
                      positions,
                      A.map((position) => [
                        position.longitude,
                        position.latitude,
                      ])
                    ),
                  }}
                >
                  <Layer
                    {...{
                      type: "line",
                      id: `line:${id}`,
                      paint: {
                        "line-width": 5,
                        "line-color": "#ff7676",
                      },
                    }}
                  />
                </Source>
              );
            })
          )}

          {pipe(
            [...positions_by_device.entries()],
            A.map(([id, positions]) => {
              return pipe(
                positions,
                A.last,
                O.match(constNull, (coords) => {
                  return (
                    <Marker
                      key={id}
                      anchor="bottom"
                      longitude={coords.longitude}
                      latitude={coords.latitude}
                    />
                  );
                })
              );
            })
          )}

          {/* {pipe(
            maybe_positions,
            O.chain(A.last),
            // O.alt(() => O.some(coords)),
            O.match(constNull, (coords) => {
              return (
                <Marker
                  anchor="bottom"
                  longitude={coords.longitude}
                  latitude={coords.latitude}
                />
              );
            })
          )} */}
        </MapView>
      </div>
    </div>
  );
}
